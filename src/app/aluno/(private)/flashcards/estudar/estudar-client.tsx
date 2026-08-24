"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  ArrowLeft,
  Check,
  Frown,
  Meh,
  Sparkles,
  ThumbsUp,
} from "lucide-react";
import { useHasFlashcardsAccess } from "@/lib/flashcards/access";
import { buildStudyQueue, type StudyCard } from "@/lib/flashcards/session";
import {
  bumpStreakAndReviews,
  fetchOriginalQuestionText,
  saveProgress,
} from "@/lib/flashcards/queries";
import { initialSrsState, scheduleNext } from "@/lib/flashcards/srs";
import type { SrsAnswer, UserFlashcardProgressDoc } from "@/lib/flashcards/types";

export default function EstudarClient() {
  const searchParams = useSearchParams();
  const deckId = searchParams.get("deck") || undefined;
  // ?n=10|20|30|50 — tamanho da sessao escolhido na tela de flashcards.
  const sessionSize = Number(searchParams.get("n")) || undefined;

  const access = useHasFlashcardsAccess();
  const [uid, setUid] = useState<string | null>(null);
  const [queue, setQueue] = useState<StudyCard[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [flipped, setFlipped] = useState(false);
  const [saving, setSaving] = useState(false);
  // Cache local dos textos completos das questoes originais (por sourceQuestionId).
  // Evita reconsultar o Firestore ao voltar em cards ja vistos.
  const [originalTexts, setOriginalTexts] = useState<Record<string, string>>({});
  const [sessionStats, setSessionStats] = useState({
    reviewed: 0,
    correct: 0,
    almost: 0,
    wrong: 0,
    newMastered: 0,
  });

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null));
  }, []);

  // Contador incrementado ao clicar em "Continuar estudando" — dispara reload
  // da fila sem precisar mudar de rota.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!access.hasAccess || !uid) {
      if (!access.loading) setLoading(false);
      return;
    }
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const q = await buildStudyQueue({ userId: uid, deckId, sessionSize });
        if (!alive) return;
        setQueue(q);
        setIndex(0);
        setSessionStats({ reviewed: 0, correct: 0, almost: 0, wrong: 0, newMastered: 0 });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [access.hasAccess, uid, deckId, sessionSize, access.loading, reloadKey]);

  const restartSession = useCallback(() => {
    setReloadKey((k) => k + 1);
  }, []);

  const current = queue[index];
  const total = queue.length;
  const isDone = !loading && (total === 0 || index >= total);

  useEffect(() => {
    setFlipped(false);
  }, [index]);

  // Se o card atual tem sourceQuestionId e ainda nao buscamos o texto completo,
  // busca em background. Tambem pre-busca o proximo card para tornar a
  // transicao imperceptivel.
  useEffect(() => {
    const idsToFetch = new Set<string>();
    for (const offset of [0, 1]) {
      const card = queue[index + offset]?.card;
      if (card?.sourceQuestionId && !originalTexts[card.sourceQuestionId]) {
        idsToFetch.add(card.sourceQuestionId);
      }
    }
    if (idsToFetch.size === 0) return;
    let cancelled = false;
    (async () => {
      const updates: Record<string, string> = {};
      await Promise.all(
        Array.from(idsToFetch).map(async (qid) => {
          const text = await fetchOriginalQuestionText(qid);
          if (text) updates[qid] = text;
        })
      );
      if (!cancelled && Object.keys(updates).length > 0) {
        setOriginalTexts((prev) => ({ ...prev, ...updates }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [index, queue, originalTexts]);

  /**
   * Retorna o texto da pergunta a mostrar:
   * - Se o frontText termina com "..." (truncado no import), usa a questao original completa
   * - Caso contrario, mantem o frontText original
   */
  const questionText = useMemo(() => {
    if (!current) return "";
    const front = current.card.frontText || "";
    const wasTruncated =
      /(\.{3,}|…)\s*$/.test(front.trim()) ||
      (front.length > 0 && front.length < 30);
    if (wasTruncated && current.card.sourceQuestionId) {
      const original = originalTexts[current.card.sourceQuestionId];
      if (original) return original;
    }
    return front;
  }, [current, originalTexts]);

  const applyAnswer = useCallback(
    async (answer: SrsAnswer) => {
      if (!uid || !current || saving) return;
      setSaving(true);
      try {
        const currentState =
          current.progress ?? {
            ...initialSrsState(),
          };
        const result = scheduleNext(
          {
            easeFactor: currentState.easeFactor ?? 2.5,
            interval: currentState.interval ?? 0,
            repetitions: currentState.repetitions ?? 0,
            box: currentState.box ?? 0,
            status: currentState.status ?? "new",
          },
          answer
        );

        const wasMasteredBefore = current.progress?.status === "mastered";
        const becameMastered = result.status === "mastered" && !wasMasteredBefore;

        const update: Partial<UserFlashcardProgressDoc> & { deckId?: string | null } = {
          deckId: deckId ?? null,
          easeFactor: result.easeFactor,
          interval: result.interval,
          repetitions: result.repetitions,
          box: result.box,
          status: result.status,
          nextReviewAt: result.nextReviewAt,
          lastReviewedAt: new Date(),
          timesReviewed: (current.progress?.timesReviewed ?? 0) + 1,
          timesCorrect: (current.progress?.timesCorrect ?? 0) + (answer === "good" ? 1 : 0),
          timesAlmost: (current.progress?.timesAlmost ?? 0) + (answer === "hard" ? 1 : 0),
          timesWrong: (current.progress?.timesWrong ?? 0) + (answer === "again" ? 1 : 0),
        };

        await saveProgress(uid, current.card.id, update);

        setSessionStats((s) => ({
          reviewed: s.reviewed + 1,
          correct: s.correct + (answer === "good" ? 1 : 0),
          almost: s.almost + (answer === "hard" ? 1 : 0),
          wrong: s.wrong + (answer === "again" ? 1 : 0),
          newMastered: s.newMastered + (becameMastered ? 1 : 0),
        }));

        // Se errou, joga o card novamente no final da fila para revisar hoje
        if (answer === "again") {
          setQueue((prev) => [...prev, prev[index]!]);
        }

        setIndex((i) => i + 1);
      } finally {
        setSaving(false);
      }
    },
    [uid, current, saving, deckId, index]
  );

  // Ao terminar, atualiza streak/contadores
  useEffect(() => {
    if (isDone && uid && sessionStats.reviewed > 0) {
      void bumpStreakAndReviews(uid, sessionStats.reviewed, sessionStats.newMastered);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDone]);

  // Atalhos de teclado
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (loading || isDone) return;
      const target = e.target as HTMLElement;
      if (target?.tagName === "TEXTAREA" || target?.tagName === "INPUT") return;

      if (!flipped) {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          setFlipped(true);
        }
        return;
      }
      if (e.key === "1") void applyAnswer("again");
      else if (e.key === "2") void applyAnswer("hard");
      else if (e.key === "3" || e.key === " " || e.key === "Enter") {
        e.preventDefault();
        void applyAnswer("good");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [flipped, loading, isDone, applyAnswer]);

  const progress = useMemo(() => {
    if (total === 0) return 0;
    return Math.min(100, Math.round((index / total) * 100));
  }, [index, total]);

  if (access.loading || loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
      </div>
    );
  }

  if (!access.hasAccess) {
    return (
      <div className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
        <p className="text-slate-600 dark:text-slate-300">Você não tem acesso a este recurso.</p>
        <Link
          href="/aluno/flashcards"
          className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-blue-600"
        >
          <ArrowLeft size={14} /> Voltar
        </Link>
      </div>
    );
  }

  if (isDone) {
    return (
      <DoneScreen
        stats={sessionStats}
        onContinue={restartSession}
      />
    );
  }

  if (!current) return null;

  return (
    <div className="mx-auto max-w-3xl">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <Link
          href="/aluno/flashcards"
          className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400"
        >
          <ArrowLeft size={14} /> Voltar
        </Link>
        <div className="text-xs font-semibold text-slate-500">
          {index + 1} / {total}
        </div>
      </div>

      {/* Barra de progresso */}
      <div className="mb-6 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div
          className="h-full bg-gradient-to-r from-emerald-500 to-blue-500 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Card com flip 3D */}
      <div className="flashcard-scene">
        <div className={`flashcard-inner ${flipped ? "is-flipped" : ""}`}>
          {/* FRENTE */}
          <div className="flashcard-face flashcard-front rounded-3xl border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col p-6 sm:p-8">
              <div className="mb-3 flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-widest text-blue-600">
                  Pergunta
                </span>
                {current.isNew && (
                  <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-yellow-800 dark:bg-yellow-950/50 dark:text-yellow-300">
                    Novo
                  </span>
                )}
                {current.card.themeName && (
                  <span className="ml-auto text-xs text-slate-500">
                    {current.card.themeName}
                  </span>
                )}
              </div>
              <p className="whitespace-pre-wrap text-lg leading-relaxed text-slate-900 dark:text-slate-100 sm:text-xl">
                {questionText || (
                  <span className="text-slate-400 italic">
                    Carregando pergunta...
                  </span>
                )}
              </p>
              <div className="mt-auto pt-6 text-center">
                <button
                  type="button"
                  onClick={() => setFlipped(true)}
                  className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-700 to-blue-500 px-8 py-4 text-base font-bold text-white shadow-lg transition hover:from-blue-600 hover:to-blue-400"
                >
                  Mostrar resposta <Kbd>Espaço</Kbd>
                </button>
              </div>
            </div>
          </div>

          {/* VERSO */}
          <div className="flashcard-face flashcard-back rounded-3xl border border-emerald-200 bg-emerald-50/40 shadow-lg dark:border-emerald-900 dark:bg-emerald-950/20">
            <div className="flex flex-col p-6 sm:p-8">
              <div className="mb-2 text-xs font-bold uppercase tracking-widest text-emerald-600">
                Resposta
              </div>
              <p className="text-xl font-bold text-emerald-800 dark:text-emerald-300">
                {current.card.backText}
              </p>
              {current.card.shortExplanation && (
                <>
                  <div className="mt-6 mb-2 text-xs font-bold uppercase tracking-widest text-slate-500">
                    Explicação
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                    {current.card.shortExplanation}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Estilos do flip 3D — CSS puro para nao depender de styled-jsx */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .flashcard-scene {
          perspective: 1500px;
          min-height: 380px;
        }
        .flashcard-inner {
          position: relative;
          width: 100%;
          transform-style: preserve-3d;
          transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .flashcard-inner.is-flipped {
          transform: rotateY(180deg);
        }
        .flashcard-face {
          width: 100%;
          -webkit-backface-visibility: hidden;
          backface-visibility: hidden;
        }
        .flashcard-front {
          position: relative;
        }
        .flashcard-back {
          position: absolute;
          top: 0;
          left: 0;
          transform: rotateY(180deg);
        }
      `,
        }}
      />

      {/* Botões de resposta */}
      {flipped && (
        <div className="mt-6 grid grid-cols-3 gap-3">
          <AnswerButton
            tone="red"
            icon={Frown}
            label="Não sabia"
            shortcut="1"
            onClick={() => void applyAnswer("again")}
            disabled={saving}
          />
          <AnswerButton
            tone="amber"
            icon={Meh}
            label="Quase"
            shortcut="2"
            onClick={() => void applyAnswer("hard")}
            disabled={saving}
          />
          <AnswerButton
            tone="emerald"
            icon={ThumbsUp}
            label="Sabia"
            shortcut="3"
            onClick={() => void applyAnswer("good")}
            disabled={saving}
          />
        </div>
      )}
    </div>
  );
}

function AnswerButton({
  tone,
  icon: Icon,
  label,
  shortcut,
  onClick,
  disabled,
}: {
  tone: "red" | "amber" | "emerald";
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  shortcut: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const colors: Record<string, string> = {
    red: "border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300",
    amber:
      "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300",
    emerald:
      "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center justify-center gap-1 rounded-2xl border-2 p-4 font-bold transition disabled:opacity-50 ${colors[tone]}`}
    >
      <Icon size={22} />
      <span className="text-sm">{label}</span>
      <Kbd>{shortcut}</Kbd>
    </button>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center rounded border border-slate-300 bg-white/70 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-slate-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300">
      {children}
    </kbd>
  );
}

function DoneScreen({
  stats,
  onContinue,
}: {
  stats: { reviewed: number; correct: number; almost: number; wrong: number; newMastered: number };
  onContinue: () => void;
}) {
  const percent = stats.reviewed > 0
    ? Math.round((stats.correct / stats.reviewed) * 100)
    : 0;

  return (
    <div className="mx-auto max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-lg dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-blue-500 text-white shadow-lg">
        <Sparkles size={40} />
      </div>
      <h2 className="text-2xl font-black text-slate-900 dark:text-white">
        {stats.reviewed === 0 ? "Nenhum card para hoje" : "Sessão concluída!"}
      </h2>
      {stats.reviewed > 0 && (
        <>
          <p className="mt-2 text-sm text-slate-500">
            Você revisou {stats.reviewed} card(s) e acertou {percent}%.
          </p>
          <div className="mt-6 grid grid-cols-3 gap-3">
            <MiniStat label="Sabia" value={stats.correct} tone="emerald" />
            <MiniStat label="Quase" value={stats.almost} tone="amber" />
            <MiniStat label="Não sabia" value={stats.wrong} tone="red" />
          </div>
          {stats.newMastered > 0 && (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
              🎉 {stats.newMastered} novo(s) card(s) dominado(s)!
            </div>
          )}
        </>
      )}
      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Link
          href="/aluno/flashcards"
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          Voltar
        </Link>
        {stats.reviewed > 0 && (
          <button
            type="button"
            onClick={onContinue}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-700 to-blue-500 px-5 py-2.5 text-sm font-bold text-white shadow-md hover:from-blue-600 hover:to-blue-400"
          >
            <Check size={14} /> Continuar estudando
          </button>
        )}
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "amber" | "red";
}) {
  const colors: Record<string, string> = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300",
    amber:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300",
    red: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300",
  };
  return (
    <div className={`rounded-xl border p-2 ${colors[tone]}`}>
      <div className="text-xl font-black">{value}</div>
      <div className="text-[10px] font-bold uppercase tracking-widest opacity-80">
        {label}
      </div>
    </div>
  );
}
