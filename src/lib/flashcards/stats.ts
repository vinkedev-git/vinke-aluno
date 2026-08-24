import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { COL_USER_FLASHCARD_SETTINGS } from "./constants";
import { fetchAllUserProgress, fetchPublishedCards } from "./queries";
import { isDue } from "./srs";
import type { UserFlashcardProgressDoc } from "./types";

/**
 * Teto de cards contados como "para revisar hoje".
 *
 * Espelha o MAX_FLASHCARDS da tela Estudo de Hoje e o newCardsLimit padrao do
 * buildStudyQueue: nao adianta anunciar 2.000 cards vencidos se a sessao do dia
 * entrega 20. Quem consome este helper NAO deve aplicar o teto de novo.
 */
export const DAILY_FLASHCARD_TARGET = 20;

export type FlashcardOverview = {
  /** Cards disponiveis para a sessao de hoje, ja limitado a DAILY_FLASHCARD_TARGET. */
  due: number;
  /** Quantos cards o aluno ja viu alguma vez (docs em userFlashcardProgress). */
  studied: number;
  /** Cards dominados. */
  mastered: number;
  streak: number;
  totalReviews: number;
};

const EMPTY: FlashcardOverview = {
  due: 0,
  studied: 0,
  mastered: 0,
  streak: 0,
  totalReviews: 0,
};

/**
 * Replica o criterio de elegibilidade do buildStudyQueue para um unico card:
 * - sem progresso            -> card novo, entra
 * - dominado/arquivado       -> so entra se tiver nextReviewAt E estiver vencido
 * - learning/reviewing/new   -> entra se estiver vencido
 */
function countsForToday(progress: UserFlashcardProgressDoc | undefined, now: Date): boolean {
  if (!progress) return true;
  if (progress.status === "mastered" || progress.status === "archived") {
    return !!progress.nextReviewAt && isDue(progress, now);
  }
  return isDue(progress, now);
}

/**
 * Numeros de flashcards para o Dashboard e o Estudo de Hoje.
 *
 * Le as colecoes do SM-2 (flashcards + userFlashcardProgress + settings). A
 * colecao antiga users/{uid}/flashcards (Leitner) nao e mais consultada.
 *
 * Somente leitura: ao contrario de fetchOrCreateSettings, nao cria o documento
 * de settings quando ele ainda nao existe.
 */
export async function getFlashcardOverview(uid: string): Promise<FlashcardOverview> {
  try {
    const [cards, progressMap, settingsSnap] = await Promise.all([
      fetchPublishedCards(),
      fetchAllUserProgress(uid),
      getDoc(doc(db, COL_USER_FLASHCARD_SETTINGS, uid)),
    ]);

    // fetchAllUserProgress devolve null se a query for negada pelas regras.
    const progress = progressMap ?? new Map<string, UserFlashcardProgressDoc>();

    const now = new Date();
    let eligible = 0;
    for (const card of cards) {
      if (countsForToday(progress.get(card.id), now)) {
        eligible += 1;
        if (eligible >= DAILY_FLASHCARD_TARGET) break;
      }
    }

    const settings = settingsSnap.exists()
      ? (settingsSnap.data() as Record<string, unknown>)
      : null;

    const masteredFromProgress = [...progress.values()].filter(
      (p) => p.status === "mastered"
    ).length;

    return {
      due: eligible,
      studied: progress.size,
      mastered: (settings?.totalCardsMastered as number) ?? masteredFromProgress,
      streak: (settings?.streak as number) ?? 0,
      totalReviews: (settings?.totalReviews as number) ?? 0,
    };
  } catch {
    // Flashcards sao um complemento do dashboard: se falhar, zera em vez de
    // derrubar a tela inteira.
    return EMPTY;
  }
}
