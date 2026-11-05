"use client";
// Diagnóstico do primeiro acesso: 10 questões das 4 áreas (provas recentes,
// sem língua estrangeira), numa sessão comum com kind "diagnostico". O player
// é o mesmo do simulado; o resultado mostra o acerto por área e leva ao plano.
//
// Estado em users/{uid}/meta/diagnostico: { sessionId, iniciadoEm, concluidoEm? }.
// As firestore.rules deixam o gratuito criar esta sessão sem gastar o
// simulado da semana (kind "diagnostico" com no máximo 10 questões).
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
  setDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export const DIAGNOSTICO_TOTAL = 10;

export const AREAS_DIAGNOSTICO = [
  { id: "area-linguagens", nome: "Linguagens", n: 2 },
  { id: "area-humanas", nome: "Humanas", n: 3 },
  { id: "area-natureza", nome: "Natureza", n: 2 },
  { id: "area-matematica", nome: "Matemática", n: 3 },
] as const;

export function nomeDaArea(areaId: string): string {
  return AREAS_DIAGNOSTICO.find((a) => a.id === areaId)?.nome ?? "Outras";
}

const ANOS_RECENTES = [2019, 2020, 2021, 2022, 2023, 2024, 2025];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type QDoc = { id: string; isActive?: unknown; enemLanguage?: unknown };

/** Sorteia as questões: para cada área, uma prova recente (2 equalidades, sem índice composto). */
async function sortearQuestoes(): Promise<string[]> {
  const ids: string[] = [];
  for (const area of AREAS_DIAGNOSTICO) {
    let escolhidas: string[] = [];
    for (const ano of shuffle(ANOS_RECENTES)) {
      const snap = await getDocs(
        query(collection(db, "questionsBank"), where("areaId", "==", area.id), where("examYear", "==", ano))
      );
      const validas = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<QDoc, "id">) }))
        .filter((q) => q.isActive !== false && !q.enemLanguage);
      escolhidas = shuffle(validas).slice(0, area.n).map((q) => q.id);
      if (escolhidas.length >= area.n) break;
    }
    ids.push(...escolhidas);
  }
  return shuffle(ids);
}

export type EstadoDiagnostico = { sessionId?: string; concluido: boolean } | null;

export async function lerDiagnostico(uid: string): Promise<EstadoDiagnostico> {
  const snap = await getDoc(doc(db, "users", uid, "meta", "diagnostico"));
  if (!snap.exists()) return null;
  const d = snap.data() as { sessionId?: unknown; concluidoEm?: unknown };
  return { sessionId: d.sessionId ? String(d.sessionId) : undefined, concluido: Boolean(d.concluidoEm) };
}

/** Cria a sessão do diagnóstico e devolve o id. */
export async function criarDiagnostico(uid: string): Promise<string> {
  const questionIds = await sortearQuestoes();
  if (questionIds.length === 0) throw new Error("Não foi possível montar o diagnóstico.");
  const sessionRef = doc(collection(db, "users", uid, "sessions"));
  const batch = writeBatch(db);
  batch.set(sessionRef, {
    title: "Diagnóstico",
    titleDisplay: "Diagnóstico · 10 questões das 4 áreas",
    kind: "diagnostico",
    status: "in_progress",
    filters: { anos: [], areas: [], assuntos: [], provas: [], niveis: [], temas: [] },
    questionIds,
    totalQuestions: questionIds.length,
    currentIndex: 0,
    answeredCount: 0,
    correctCount: 0,
    wrongCount: 0,
    scorePercent: 0,
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  });
  batch.set(
    doc(db, "users", uid, "meta", "diagnostico"),
    { sessionId: sessionRef.id, iniciadoEm: serverTimestamp() },
    { merge: true }
  );
  await batch.commit();
  return sessionRef.id;
}

export async function marcarDiagnosticoConcluido(uid: string, sessionId: string, porArea: Record<string, { total: number; correct: number }>) {
  await setDoc(
    doc(db, "users", uid, "meta", "diagnostico"),
    { sessionId, concluidoEm: serverTimestamp(), porArea },
    { merge: true }
  );
}
