"use client";
// Revisão de erros (sessões kind "error_review"). Antes, cada toque em
// "Refazer erros" (Resultado, Estudo de hoje, Caderno) criava uma sessão nova:
// o aluno respondia 2 de 5, saía, voltava e ganhava outra do zero — o mesmo
// defeito do "Nova tentativa" das provas. Agora a revisão em andamento da
// MESMA origem é reaberta; só se cria outra quando não há nenhuma pendente.
import { addDoc, collection, getDocs, query, serverTimestamp, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

export type NovaRevisao = {
  /** identifica de onde veio, ex.: "resultado:<sessionId>", "estudo:2026-11-22", "caderno:todos" */
  origem: string;
  questionIds: string[];
  title: string;
  titleDisplay: string;
  temas?: string[];
};

export async function abrirRevisao(uid: string, r: NovaRevisao): Promise<string> {
  const abertas = await getDocs(
    query(collection(db, "users", uid, "sessions"), where("kind", "==", "error_review"), where("status", "==", "in_progress"))
  );
  const mesma = abertas.docs
    .map((d) => ({ id: d.id, ...(d.data() as { origem?: string; answeredCount?: number; totalQuestions?: number; updatedAt?: { toMillis?: () => number } }) }))
    .filter((s) => s.origem === r.origem && Number(s.answeredCount ?? 0) < Number(s.totalQuestions ?? 0))
    .sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0))[0];
  if (mesma) return mesma.id;

  const ref = await addDoc(collection(db, "users", uid, "sessions"), {
    title: r.title,
    titleDisplay: r.titleDisplay,
    kind: "error_review",
    origem: r.origem,
    status: "in_progress",
    filters: { provas: [], provaIds: [], niveis: [], temas: r.temas ?? [] },
    questionIds: r.questionIds,
    totalQuestions: r.questionIds.length,
    currentIndex: 0,
    answeredCount: 0,
    correctCount: 0,
    wrongCount: 0,
    scorePercent: 0,
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  });
  return ref.id;
}
