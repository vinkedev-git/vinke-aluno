export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";

// Registro de erros do app do aluno (coleção client_errors, lida pelo admin).
// Existe porque, sem isto, não dava para saber se o aluno que abriu um
// simulado e não respondeu nada desistiu ou travou (nov/2026).
// Gravado pelo Admin SDK: não precisa de regra nova no Firestore. O token do
// aluno é opcional (erro antes do login também conta) e só serve para o uid.

const _janela = new Map<string, { n: number; ate: number }>();
function limitado(chave: string): boolean {
  const agora = Date.now();
  const e = _janela.get(chave);
  if (!e || agora > e.ate) {
    _janela.set(chave, { n: 1, ate: agora + 60_000 });
    return false;
  }
  e.n += 1;
  return e.n > 20; // até 20 erros por minuto por aparelho/aluno
}

const corta = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : null);

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    let uid: string | null = null;
    const auth = req.headers.get("authorization") || "";
    if (auth.startsWith("Bearer ")) {
      uid = await getAdminAuth()
        .verifyIdToken(auth.slice(7))
        .then((t) => t.uid)
        .catch(() => null);
    }
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "sem-ip";
    if (limitado(uid || ip)) return NextResponse.json({ ok: true, ignorado: "limite" });

    const ua = corta(req.headers.get("user-agent"), 300);
    const contexto =
      body.contexto && typeof body.contexto === "object"
        ? JSON.parse(JSON.stringify(body.contexto).slice(0, 1500).replace(/[^}\]]*$/, "") || "{}")
        : null;
    await getAdminDb().collection("client_errors").add({
      uid,
      tipo: corta(body.tipo, 60) || "desconhecido",
      mensagem: corta(body.mensagem, 500),
      stack: corta(body.stack, 1500),
      rota: corta(body.rota, 200),
      contexto,
      userAgent: ua,
      device: ua && /iphone|ipad|android/i.test(ua) ? "mobile" : "desktop",
      createdAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ ok: true });
  } catch {
    // telemetria nunca devolve erro para o aluno
    return NextResponse.json({ ok: true });
  }
}
