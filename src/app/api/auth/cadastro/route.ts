export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";

// Cadastro self-service do plano gratuito.
// Criado pelo Admin SDK (e não pelo client) para que os docs de
// users/entitlements nasçam junto com a conta sem depender de regras
// do Firestore permitirem escrita do próprio aluno nessas coleções.

// Simples rate limit em memória (por processo — suficiente para início)
const _attempts = new Map<string, { count: number; resetAt: number }>();
function isRateLimited(key: string): boolean {
  const now = Date.now();
  const entry = _attempts.get(key);
  if (!entry || now > entry.resetAt) {
    _attempts.set(key, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  if (entry.count >= 5) return true;
  entry.count += 1;
  return false;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { nome?: unknown; email?: unknown; senha?: unknown };
    const nome = typeof body.nome === "string" ? body.nome.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const senha = typeof body.senha === "string" ? body.senha : "";

    if (nome.length < 2) {
      return NextResponse.json({ ok: false, error: "Digite seu nome." }, { status: 400 });
    }
    if (!email.includes("@") || email.length < 5) {
      return NextResponse.json({ ok: false, error: "E-mail inválido." }, { status: 400 });
    }
    if (senha.length < 6) {
      return NextResponse.json(
        { ok: false, error: "A senha precisa ter pelo menos 6 caracteres." },
        { status: 400 }
      );
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "sem-ip";
    if (isRateLimited(ip) || isRateLimited(email)) {
      return NextResponse.json(
        { ok: false, error: "Muitas tentativas. Aguarde um minuto e tente novamente." },
        { status: 429 }
      );
    }

    const user = await getAdminAuth().createUser({
      email,
      password: senha,
      displayName: nome,
    });

    const db = getAdminDb();
    const batch = db.batch();
    batch.set(
      db.collection("users").doc(user.uid),
      {
        uid: user.uid,
        name: nome,
        nome,
        email,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        origem: "cadastro-self-service",
      },
      { merge: true }
    );
    batch.set(
      db.collection("entitlements").doc(user.uid),
      {
        active: true,
        plan: "gratuito",
        productTitle: "Plano Gratuito",
        source: "cadastro-self-service",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    await batch.commit();

    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = (error as { code?: string })?.code ?? "";
    if (code === "auth/email-already-exists") {
      return NextResponse.json(
        { ok: false, error: "Este e-mail já tem uma conta. Faça login ou use “Esqueci minha senha”." },
        { status: 409 }
      );
    }
    if (code === "auth/invalid-email") {
      return NextResponse.json({ ok: false, error: "E-mail inválido." }, { status: 400 });
    }
    if (code === "auth/invalid-password") {
      return NextResponse.json(
        { ok: false, error: "A senha precisa ter pelo menos 6 caracteres." },
        { status: 400 }
      );
    }
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[cadastro]", msg);
    return NextResponse.json(
      { ok: false, error: "Não foi possível criar sua conta. Tente novamente em instantes." },
      { status: 500 }
    );
  }
}
