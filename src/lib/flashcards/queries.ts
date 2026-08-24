import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit as fbLimit,
  query,
  setDoc,
  where,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { COL_FLASHCARDS, COL_FLASHCARD_DECKS, COL_USER_FLASHCARD_PROGRESS, COL_USER_FLASHCARD_SETTINGS, SM2 } from "./constants";
import { initialSrsState } from "./srs";
import type {
  Difficulty,
  FlashcardDeckDoc,
  FlashcardDoc,
  Module,
  SrsStatus,
  UserFlashcardProgressDoc,
  UserFlashcardSettingsDoc,
} from "./types";

// ─── Utils ────────────────────────────────────────────────────────────────────

export function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === "object" && value !== null && "toDate" in value) {
    const t = value as { toDate?: () => Date };
    if (typeof t.toDate === "function") return t.toDate();
  }
  return null;
}

// ─── Flashcards ───────────────────────────────────────────────────────────────

export type FlashcardListItem = {
  id: string;
  frontText: string;
  backText: string;
  shortExplanation: string;
  themeId: string;
  themeName: string;
  moduleId: Module | null;
  deckIds: string[];
  difficulty: Difficulty;
  sourceQuestionId: string | null;
  sourceQuestionPreview: string | null;
};

function toFlashcardListItem(id: string, data: Record<string, unknown>): FlashcardListItem {
  return {
    id,
    frontText: (data.frontText as string) ?? "",
    backText: (data.backText as string) ?? "",
    shortExplanation: (data.shortExplanation as string) ?? "",
    themeId: (data.themeId as string) ?? "",
    themeName: (data.themeName as string) ?? "",
    moduleId: (data.moduleId as Module | null) ?? null,
    deckIds: Array.isArray(data.deckIds) ? (data.deckIds as string[]) : [],
    difficulty: (data.difficulty as Difficulty) ?? "medium",
    sourceQuestionId: (data.sourceQuestionId as string | null) ?? null,
    sourceQuestionPreview: (data.sourceQuestionPreview as string | null) ?? null,
  };
}

/**
 * Busca o texto completo da questao original de um card.
 * Usado quando o frontText foi truncado no import — extrai o prompt real
 * de questionsBank/{sourceQuestionId}.
 */
export async function fetchOriginalQuestionText(
  sourceQuestionId: string
): Promise<string | null> {
  try {
    const snap = await getDoc(doc(db, "questionsBank", sourceQuestionId));
    if (!snap.exists()) return null;
    const data = snap.data() as Record<string, unknown>;
    const raw =
      (data.prompt_text as string) ||
      (data.prompt as string) ||
      (data.questionText as string) ||
      (data.statement as string) ||
      "";
    if (!raw) return null;
    // Remove HTML basico
    return raw
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return null;
  }
}

/**
 * Teto de varredura da colecao de cards.
 *
 * IMPORTANTE: este limite NAO pode ficar abaixo do total de cards publicados.
 * O Firestore devolve os documentos em ordem de ID quando nao ha orderBy, ou
 * seja: um teto menor que a colecao recorta sempre a MESMA fatia inicial e os
 * cards com ID "alto" (ex.: prefixo fc_liv_) ficam invisiveis no Deck do Dia.
 * Se a colecao passar deste valor, aumente aqui.
 */
export const MAX_CARDS_SCAN = 8000;

/**
 * Lista cards publicados (com/sem filtro por deck).
 * Aluno TSA vê tudo: cards de ME + TEA + TSA.
 */
export async function fetchPublishedCards(opts?: {
  deckId?: string;
  moduleId?: Module;
  max?: number;
}): Promise<FlashcardListItem[]> {
  const constraints: Parameters<typeof query>[1][] = [
    where("status", "==", "published"),
    where("isActive", "==", true),
  ];
  if (opts?.deckId) constraints.push(where("deckIds", "array-contains", opts.deckId));
  if (opts?.moduleId) constraints.push(where("moduleId", "==", opts.moduleId));
  constraints.push(fbLimit(opts?.max ?? MAX_CARDS_SCAN));

  const q = query(collection(db, COL_FLASHCARDS), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => toFlashcardListItem(d.id, d.data() as Record<string, unknown>));
}

// ─── Decks ────────────────────────────────────────────────────────────────────

export type DeckListItem = {
  id: string;
  title: string;
  description: string;
  moduleId: Module | null;
  themeId: string | null;
  cardCount: number;
  order: number;
};

export async function fetchPublishedDecks(): Promise<DeckListItem[]> {
  const q = query(
    collection(db, COL_FLASHCARD_DECKS),
    where("status", "==", "published"),
    where("isActive", "==", true)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => {
      const data = d.data() as Record<string, unknown>;
      return {
        id: d.id,
        title: (data.title as string) ?? "",
        description: (data.description as string) ?? "",
        moduleId: (data.moduleId as Module | null) ?? null,
        themeId: (data.themeId as string | null) ?? null,
        cardCount: (data.cardCount as number) ?? 0,
        order: (data.order as number) ?? 0,
      };
    })
    .sort((a, b) => a.order - b.order);
}

// ─── Progresso individual ─────────────────────────────────────────────────────

export function progressDocId(userId: string, flashcardId: string): string {
  return `${userId}_${flashcardId}`;
}

function toProgressDoc(
  userId: string,
  flashcardId: string,
  data: Record<string, unknown>
): UserFlashcardProgressDoc {
  return {
    userId: (data.userId as string) ?? userId,
    flashcardId: (data.flashcardId as string) ?? flashcardId,
    deckId: (data.deckId as string | null) ?? null,
    easeFactor: (data.easeFactor as number) ?? SM2.DEFAULT_EASE,
    interval: (data.interval as number) ?? 0,
    repetitions: (data.repetitions as number) ?? 0,
    box: (data.box as number) ?? 0,
    status: (data.status as SrsStatus) ?? "new",
    lastReviewedAt: toDate(data.lastReviewedAt),
    nextReviewAt: toDate(data.nextReviewAt),
    timesReviewed: (data.timesReviewed as number) ?? 0,
    timesCorrect: (data.timesCorrect as number) ?? 0,
    timesAlmost: (data.timesAlmost as number) ?? 0,
    timesWrong: (data.timesWrong as number) ?? 0,
    createdAt: toDate(data.createdAt) ?? new Date(),
    updatedAt: toDate(data.updatedAt) ?? new Date(),
  };
}

/**
 * Busca TODO o progresso do aluno numa unica query (where userId == uid).
 *
 * Substitui o getDoc-por-card do fetchUserProgress: o volume aqui e o numero de
 * cards que o aluno JA estudou (tipicamente centenas), nao o tamanho da colecao.
 *
 * Depende da permissao de `list` em userFlashcardProgress (firestore.rules).
 * Retorna null se a query for negada, para o chamador cair no fallback.
 */
export async function fetchAllUserProgress(
  userId: string
): Promise<Map<string, UserFlashcardProgressDoc> | null> {
  try {
    const q = query(
      collection(db, COL_USER_FLASHCARD_PROGRESS),
      where("userId", "==", userId),
      fbLimit(MAX_CARDS_SCAN)
    );
    const snap = await getDocs(q);
    const result = new Map<string, UserFlashcardProgressDoc>();
    snap.docs.forEach((d) => {
      const data = d.data() as Record<string, unknown>;
      const fcId = (data.flashcardId as string) || d.id.replace(`${userId}_`, "");
      if (fcId) result.set(fcId, toProgressDoc(userId, fcId, data));
    });
    return result;
  } catch {
    return null;
  }
}

export async function fetchUserProgress(
  userId: string,
  flashcardIds: string[]
): Promise<Map<string, UserFlashcardProgressDoc>> {
  const result = new Map<string, UserFlashcardProgressDoc>();
  if (!flashcardIds.length) return result;

  // Firestore nao permite muitos "in" queries. Batch em chunks de 25.
  const CHUNK = 25;
  for (let i = 0; i < flashcardIds.length; i += CHUNK) {
    const chunk = flashcardIds.slice(i, i + CHUNK);
    const ids = chunk.map((fcId) => progressDocId(userId, fcId));
    // Como docId contem "_", nao dá pra filtrar por "in" no docId de forma pratica.
    // Fazemos getDoc individual em paralelo — Firestore prefere pouco pra IDs conhecidos.
    const promises = ids.map((docId) => getDoc(doc(db, COL_USER_FLASHCARD_PROGRESS, docId)));
    const snaps = await Promise.all(promises);
    snaps.forEach((snap, idx) => {
      if (snap.exists()) {
        const data = snap.data() as Record<string, unknown>;
        result.set(chunk[idx]!, toProgressDoc(userId, chunk[idx]!, data));
      }
    });
  }

  return result;
}

/**
 * Salva o progresso apos uma revisao.
 */
export async function saveProgress(
  userId: string,
  flashcardId: string,
  update: Partial<UserFlashcardProgressDoc> & { deckId?: string | null }
): Promise<void> {
  const docId = progressDocId(userId, flashcardId);
  const ref = doc(db, COL_USER_FLASHCARD_PROGRESS, docId);
  const snap = await getDoc(ref);
  const now = new Date();
  const base: UserFlashcardProgressDoc = snap.exists()
    ? {
        userId,
        flashcardId,
        deckId: null,
        ...initialSrsState(),
        lastReviewedAt: null,
        nextReviewAt: null,
        timesReviewed: 0,
        timesCorrect: 0,
        timesAlmost: 0,
        timesWrong: 0,
        createdAt: now,
        updatedAt: now,
        ...((snap.data() as Partial<UserFlashcardProgressDoc>) ?? {}),
      }
    : {
        userId,
        flashcardId,
        deckId: null,
        ...initialSrsState(),
        lastReviewedAt: null,
        nextReviewAt: null,
        timesReviewed: 0,
        timesCorrect: 0,
        timesAlmost: 0,
        timesWrong: 0,
        createdAt: now,
        updatedAt: now,
      };

  const next: UserFlashcardProgressDoc = {
    ...base,
    ...update,
    userId,
    flashcardId,
    updatedAt: now,
  };

  await setDoc(ref, next, { merge: true });
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function fetchOrCreateSettings(userId: string): Promise<UserFlashcardSettingsDoc> {
  const ref = doc(db, COL_USER_FLASHCARD_SETTINGS, userId);
  const snap = await getDoc(ref);
  const now = new Date();
  if (snap.exists()) {
    const data = snap.data() as Record<string, unknown>;
    return {
      userId,
      newCardsPerDay: (data.newCardsPerDay as number) ?? SM2.DEFAULT_NEW_CARDS_PER_DAY,
      reviewsPerDay: (data.reviewsPerDay as number) ?? SM2.DEFAULT_REVIEWS_PER_DAY,
      streak: (data.streak as number) ?? 0,
      longestStreak: (data.longestStreak as number) ?? 0,
      lastStudyDate: toDate(data.lastStudyDate),
      totalCardsMastered: (data.totalCardsMastered as number) ?? 0,
      totalReviews: (data.totalReviews as number) ?? 0,
      enabledModules: Array.isArray(data.enabledModules)
        ? (data.enabledModules as Module[])
        : ["me", "tea", "tsa"],
      createdAt: toDate(data.createdAt) ?? now,
      updatedAt: toDate(data.updatedAt) ?? now,
    };
  }
  const defaults: UserFlashcardSettingsDoc = {
    userId,
    newCardsPerDay: SM2.DEFAULT_NEW_CARDS_PER_DAY,
    reviewsPerDay: SM2.DEFAULT_REVIEWS_PER_DAY,
    streak: 0,
    longestStreak: 0,
    lastStudyDate: null,
    totalCardsMastered: 0,
    totalReviews: 0,
    enabledModules: ["me", "tea", "tsa"],
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(ref, defaults);
  return defaults;
}

/**
 * Atualiza settings apos uma sessao de estudo (streak, contadores).
 */
export async function bumpStreakAndReviews(
  userId: string,
  reviewsToAdd: number,
  newMastered: number
): Promise<void> {
  const settings = await fetchOrCreateSettings(userId);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let streak = settings.streak;
  let longestStreak = settings.longestStreak;
  const lastStudy = settings.lastStudyDate ? new Date(settings.lastStudyDate) : null;
  if (lastStudy) lastStudy.setHours(0, 0, 0, 0);

  if (!lastStudy) {
    streak = 1;
  } else {
    const diffDays = Math.floor((today.getTime() - lastStudy.getTime()) / (24 * 60 * 60 * 1000));
    if (diffDays === 0) {
      // Ja estudou hoje — mantem streak
    } else if (diffDays === 1) {
      streak += 1;
    } else {
      streak = 1;
    }
  }
  if (streak > longestStreak) longestStreak = streak;

  const ref = doc(db, COL_USER_FLASHCARD_SETTINGS, userId);
  await setDoc(
    ref,
    {
      userId,
      streak,
      longestStreak,
      lastStudyDate: today,
      totalReviews: settings.totalReviews + reviewsToAdd,
      totalCardsMastered: settings.totalCardsMastered + newMastered,
      updatedAt: new Date(),
    },
    { merge: true }
  );
}
