import { SM2 } from "./constants";
import { comparePriority, isDue } from "./srs";
import type { UserFlashcardProgressDoc } from "./types";
import {
  fetchAllUserProgress,
  fetchPublishedCards,
  fetchUserProgress,
  type FlashcardListItem,
} from "./queries";

/**
 * Uma unidade de estudo (card + progresso atual).
 */
export type StudyCard = {
  card: FlashcardListItem;
  progress: UserFlashcardProgressDoc | null;
  /** true se é a primeira vez que o aluno ve este card */
  isNew: boolean;
};

/**
 * Quantos cards o fallback de progresso inspeciona quando a query em massa
 * nao esta disponivel. Mantido baixo porque esse caminho faz 1 round-trip a
 * cada 25 cards.
 */
const FALLBACK_PROGRESS_SCAN = 600;

/**
 * Configuracao da sessao de estudo do dia.
 */
export type StudyQueueOpts = {
  userId: string;
  deckId?: string;
  newCardsLimit?: number;
  reviewsLimit?: number;
  /**
   * Teto de cards da sessao escolhido pelo aluno (10/20/30/50).
   * Aplicado no fim, sobre a fila ja intercalada, entao a proporcao de
   * revisoes e cards novos e preservada. Ausente = sessao completa.
   */
  sessionSize?: number;
};

/** Opcoes de tamanho de sessao oferecidas ao aluno. */
export const SESSION_SIZES = [10, 20, 30, 50] as const;

/**
 * Monta a fila de estudo do "Deck do Dia":
 * - cards vencidos (nextReviewAt <= agora), ordenados por prioridade
 * - + cards novos até o limite
 * - + cards em aprendizado
 *
 * A logica busca todos os cards publicados (opcionalmente por deck) e o
 * progresso individual, entao filtra e ordena.
 */
export async function buildStudyQueue(opts: StudyQueueOpts): Promise<StudyCard[]> {
  const {
    userId,
    deckId,
    newCardsLimit = SM2.DEFAULT_NEW_CARDS_PER_DAY,
    reviewsLimit = SM2.DEFAULT_REVIEWS_PER_DAY,
    sessionSize,
  } = opts;

  const cards = await fetchPublishedCards({ deckId });
  if (!cards.length) return [];

  // Caminho normal: uma unica query cobre todo o progresso do aluno.
  let progressMap = await fetchAllUserProgress(userId);

  if (!progressMap) {
    // Fallback (regras sem permissao de `list`): volta ao getDoc por card. Como
    // isso custa 1 round-trip a cada 25 cards, limitamos o conjunto verificado
    // para nao travar a tela — o resultado fica degradado, nao quebrado.
    console.warn(
      "[flashcards] query de progresso negada; usando fallback limitado a " +
        `${FALLBACK_PROGRESS_SCAN} cards. Faça deploy das regras do Firestore.`
    );
    progressMap = await fetchUserProgress(
      userId,
      cards.slice(0, FALLBACK_PROGRESS_SCAN).map((c) => c.id)
    );
  }

  const now = new Date();
  const learningOrReview: StudyCard[] = [];
  const newCards: StudyCard[] = [];

  for (const card of cards) {
    const progress = progressMap.get(card.id) ?? null;
    if (!progress) {
      newCards.push({ card, progress: null, isNew: true });
    } else if (progress.status === "mastered" || progress.status === "archived") {
      // Cards dominados sao revisados quando "vencerem" novamente
      if (progress.nextReviewAt && isDue(progress, now)) {
        learningOrReview.push({ card, progress, isNew: false });
      }
    } else {
      // learning/reviewing/new (com progresso)
      if (isDue(progress, now)) {
        learningOrReview.push({ card, progress, isNew: false });
      }
    }
  }

  // Ordena reviews por prioridade
  learningOrReview.sort((a, b) =>
    comparePriority(
      { nextReviewAt: a.progress?.nextReviewAt ?? null, status: a.progress?.status ?? "new" },
      { nextReviewAt: b.progress?.nextReviewAt ?? null, status: b.progress?.status ?? "new" }
    )
  );

  // Embaralha novos deterministicamente por id (mesma ordem entre sessoes do dia)
  newCards.sort((a, b) => a.card.id.localeCompare(b.card.id));

  const reviews = learningOrReview.slice(0, reviewsLimit);
  const news = newCards.slice(0, newCardsLimit);

  // Ordem final: reviews primeiro (mais urgentes), depois novos, intercalando um pouco
  const queue: StudyCard[] = [];
  const R = reviews.length;
  const N = news.length;
  const total = R + N;
  let ri = 0;
  let ni = 0;
  // Intercala 3 reviews : 1 new
  while (queue.length < total) {
    for (let k = 0; k < 3 && ri < R; k += 1) queue.push(reviews[ri++]!);
    if (ni < N) queue.push(news[ni++]!);
  }

  // Corta no tamanho pedido pelo aluno. Como o corte vem depois da intercalacao,
  // os cards vencidos mais urgentes continuam entrando primeiro.
  if (sessionSize && sessionSize > 0) return queue.slice(0, sessionSize);
  return queue;
}
