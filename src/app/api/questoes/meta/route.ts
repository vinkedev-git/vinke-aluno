export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";

// Índice leve do banco para a tela "Novo simulado": só o que ela usa para
// contar e sortear (ano, área, assuntos). Antes a tela baixava a coleção
// inteira (4.000+ questões com enunciado, alternativas e resolução) a cada
// visita — pesado no 3G. O sorteio continua no cliente; o player carrega o
// conteúdo de cada questão sorteada, como sempre.
// Cache de 1 h na borda (o banco muda raramente).

type Meta = { id: string; y: number | null; a: string; t: string[] };

let memo: { em: number; dados: Meta[] } | null = null;
const UMA_HORA = 60 * 60 * 1000;

export async function GET() {
  try {
    if (!memo || Date.now() - memo.em > UMA_HORA) {
      const snap = await getAdminDb()
        .collection("questionsBank")
        .select("isActive", "examYear", "prova_ano", "areaId", "assuntos", "themes")
        .get();
      const dados: Meta[] = [];
      for (const d of snap.docs) {
        if (d.get("isActive") === false) continue;
        const ano = Number(d.get("examYear") ?? d.get("prova_ano"));
        const assuntos = [...(Array.isArray(d.get("assuntos")) ? d.get("assuntos") : []), ...(Array.isArray(d.get("themes")) ? d.get("themes") : [])]
          .map((x: unknown) => String(x ?? "").trim())
          .filter(Boolean);
        dados.push({ id: d.id, y: Number.isFinite(ano) ? ano : null, a: String(d.get("areaId") ?? ""), t: Array.from(new Set(assuntos)) });
      }
      memo = { em: Date.now(), dados };
    }
    return NextResponse.json(
      { ok: true, questoes: memo.dados },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } }
    );
  } catch (e) {
    console.error("[questoes/meta]", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
