"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { SkeletonCard } from "@/components/ui/skeleton";
import {
  Sparkles,
  Layers,
  NotebookPen,
  Zap,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock,
  BookOpen,
  Target,
} from "lucide-react";
import { getDailyStatus } from "@/lib/daily";
import { getFlashcardOverview } from "@/lib/flashcards/stats";
import { dayKey } from "@/lib/study-tracking";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function safeStr(v: unknown): string {
  return String(v ?? "").trim();
}

function formatMin(min: number): string {
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

// Tempos estimados por item (em minutos)
const MIN_PER_QUESTION  = 1.5;
const MIN_PER_REVIEW    = 1.0;
const MIN_PER_FLASHCARD = 0.5;
const MIN_PER_DAILY     = 2.0;
const MAX_NEW_QUESTIONS = 20;
const MAX_REVIEWS       = 15;
// O teto de flashcards vive em DAILY_FLASHCARD_TARGET (lib/flashcards/stats),
// aplicado dentro do getFlashcardOverview.

// ─── Tipos ────────────────────────────────────────────────────────────────────

type BlockId = "questao-do-dia" | "flashcards" | "caderno" | "questoes-novas";

type StudyBlock = {
  id: BlockId;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  count: number;
  estimatedMin: number;
  done: boolean;
  color: "amber" | "indigo" | "rose" | "blue";
  action: string;
};

type PlanData = {
  weakTheme: string | null;
  dailyQuestionsGoal: number;
  todayAnswered: number;
  todayFlashcards: number;
  dailyFlashcardsGoal: number;
  flashcardsDue: number;
  errorsPending: number;
  dailyAnswered: boolean;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function EstudoDeHojeClient() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<PlanData | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const u = auth.currentUser;
    if (!u) { setLoading(false); return; }
    setLoading(true);

    try {
      const [statsSnap, settingsSnap, fcOverview, errorSnap, dailyStatus] = await Promise.all([
        getDoc(doc(db, "users", u.uid, "meta", "stats")),
        getDoc(doc(db, "users", u.uid, "meta", "settings")),
        getFlashcardOverview(u.uid),
        getDocs(collection(db, "users", u.uid, "errorNotebook")),
        getDailyStatus(u.uid),
      ]);

      // Stats e meta
      const stats = statsSnap.exists() ? statsSnap.data() as Record<string, unknown> : {};
      const settings = settingsSnap.exists() ? settingsSnap.data() as Record<string, unknown> : {};

      const todayAnswered = Number(stats.todayAnswered ?? 0);
      const todayFlashcards = Number(stats.todayFlashcards ?? 0);
      const dailyQuestionsGoal = Number(settings.dailyQuestionsGoal ?? 20);
      const dailyFlashcardsGoal = Number(settings.dailyFlashcardsGoal ?? 10);

      // Tema fraco (byTheme com amostra mínima de 5)
      let weakTheme: string | null = null;
      const byTheme = stats.byTheme as Record<string, { total?: number; correct?: number }> | undefined;
      if (byTheme) {
        let worst: { theme: string; acc: number } | null = null;
        for (const [t, v] of Object.entries(byTheme)) {
          const total = Number(v?.total ?? 0);
          const correct = Number(v?.correct ?? 0);
          if (total < 5) continue;
          const acc = correct / total;
          if (!worst || acc < worst.acc) worst = { theme: t, acc };
        }
        weakTheme = worst?.theme ?? null;
      }

      // Flashcards disponiveis hoje (SM-2). O helper limita ao teto global do
      // modulo (20); aqui respeitamos tambem a META DIARIA que o aluno definiu
      // nas configuracoes, descontando o que ja revisou hoje.
      const flashcardsDue = Math.min(
        fcOverview.due,
        Math.max(0, dailyFlashcardsGoal - todayFlashcards)
      );

      // Erros pendentes
      const errorsPending = Math.min(
        MAX_REVIEWS,
        errorSnap.docs.filter((d) => {
          const e = d.data() as { status?: string };
          return (e.status ?? "pending") === "pending";
        }).length
      );

      setPlan({
        weakTheme,
        dailyQuestionsGoal,
        todayAnswered,
        todayFlashcards,
        dailyFlashcardsGoal,
        flashcardsDue,
        errorsPending,
        dailyAnswered: dailyStatus?.answered ?? false,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Recarrega ao voltar para a aba (usuário estuda e retorna)
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  const blocks = useMemo<StudyBlock[]>(() => {
    if (!plan) return [];

    const newQuestionsCount = Math.min(
      MAX_NEW_QUESTIONS,
      Math.max(0, plan.dailyQuestionsGoal - plan.todayAnswered)
    );

    return [
      {
        id: "questao-do-dia",
        title: "Questão do dia",
        subtitle: plan.dailyAnswered
          ? "Já respondida hoje ✓"
          : "1 questão especial do dia",
        icon: <CalendarDays size={20} />,
        count: 1,
        estimatedMin: plan.dailyAnswered ? 0 : MIN_PER_DAILY,
        done: plan.dailyAnswered,
        color: "amber",
        action: plan.dailyAnswered ? "Ver" : "Responder",
      },
      {
        id: "flashcards",
        title: "Revisão de flashcards",
        subtitle: plan.flashcardsDue === 0 || plan.todayFlashcards >= plan.dailyFlashcardsGoal
          ? `Meta de ${plan.dailyFlashcardsGoal} flashcards atingida ✓`
          : `${plan.flashcardsDue} card${plan.flashcardsDue > 1 ? "s" : ""} para revisar`,
        icon: <Layers size={20} />,
        count: plan.flashcardsDue,
        estimatedMin: plan.flashcardsDue * MIN_PER_FLASHCARD,
        done: plan.flashcardsDue === 0 || plan.todayFlashcards >= plan.dailyFlashcardsGoal,
        color: "indigo",
        action: plan.flashcardsDue > 0 && plan.todayFlashcards < plan.dailyFlashcardsGoal
          ? `Revisar ${plan.flashcardsDue}`
          : "Ver flashcards",
      },
      {
        id: "caderno",
        title: "Caderno de erros",
        subtitle: plan.errorsPending > 0
          ? `${plan.errorsPending} questão${plan.errorsPending > 1 ? "s" : ""} para revisar`
          : "Nenhum erro pendente ✓",
        icon: <NotebookPen size={20} />,
        count: plan.errorsPending,
        estimatedMin: plan.errorsPending * MIN_PER_REVIEW,
        done: plan.errorsPending === 0,
        color: "rose",
        action: plan.errorsPending > 0 ? `Refazer ${plan.errorsPending} erro${plan.errorsPending > 1 ? "s" : ""}` : "Ver caderno",
      },
      {
        id: "questoes-novas",
        title: "Questões novas",
        subtitle: newQuestionsCount > 0
          ? `${newQuestionsCount} questões${plan.weakTheme ? ` de ${plan.weakTheme}` : " do banco"}`
          : `Meta de ${plan.dailyQuestionsGoal} questões atingida ✓`,
        icon: <BookOpen size={20} />,
        count: newQuestionsCount,
        estimatedMin: newQuestionsCount * MIN_PER_QUESTION,
        done: newQuestionsCount === 0,
        color: "blue",
        action: newQuestionsCount > 0 ? "Começar simulado" : "Ver simulados",
      },
    ];
  }, [plan]);

  const totalMin = useMemo(
    () => blocks.reduce((acc, b) => acc + (b.done ? 0 : b.estimatedMin), 0),
    [blocks]
  );
  const doneCount = useMemo(() => blocks.filter((b) => b.done).length, [blocks]);
  const allDone = doneCount === blocks.length;
  const firstPending = useMemo(() => blocks.find((b) => !b.done), [blocks]);

  async function startBlock(block: StudyBlock) {
    const u = auth.currentUser;
    if (!u) return;

    switch (block.id) {
      case "questao-do-dia":
        router.push("/aluno/questao-do-dia");
        break;
      case "flashcards":
        router.push("/aluno/flashcards/estudar");
        break;
      case "caderno":
        if (plan && plan.errorsPending > 0 && !creating) {
          // Cria simulado com erros pendentes (mesmo fluxo do caderno)
          setCreating(true);
          try {
            const errorSnap = await getDocs(collection(db, "users", u.uid, "errorNotebook"));
            const pending = errorSnap.docs
              .filter((d) => {
                const e = d.data() as { status?: string };
                return (e.status ?? "pending") === "pending";
              })
              .map((d) => safeStr((d.data() as { questionId?: unknown }).questionId))
              .filter(Boolean);

            const shuffled = [...pending];
            for (let i = shuffled.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            const questionIds = shuffled.slice(0, 15);

            const ref = await addDoc(collection(db, "users", u.uid, "sessions"), {
              title: "Revisão de erros",
              titleDisplay: "Revisão de erros",
              kind: "error_review",
              status: "in_progress",
              filters: { provas: [], provaIds: [], niveis: [], temas: [] },
              questionIds,
              totalQuestions: questionIds.length,
              currentIndex: 0,
              answeredCount: 0, correctCount: 0, wrongCount: 0, scorePercent: 0,
              updatedAt: serverTimestamp(),
              createdAt: serverTimestamp(),
            });
            router.push(`/aluno/simulados/${ref.id}`);
          } finally {
            setCreating(false);
          }
        } else {
          router.push("/aluno/caderno");
        }
        break;
      case "questoes-novas":
        if (plan && plan.dailyQuestionsGoal - plan.todayAnswered > 0 && !creating) {
          const qtd = Math.min(MAX_NEW_QUESTIONS, plan.dailyQuestionsGoal - plan.todayAnswered);
          const params = new URLSearchParams({ qtd: String(qtd) });
          if (plan.weakTheme) params.set("tema", plan.weakTheme);
          router.push(`/aluno/simulados/novo?${params.toString()}`);
        } else {
          router.push("/aluno/simulados");
        }
        break;
    }
  }
  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-56 animate-pulse rounded-2xl bg-vinke-line2 dark:bg-vinke-navy-sel" />
        <div className="h-24 animate-pulse rounded-2xl bg-vinke-line2 dark:bg-vinke-navy-sel" />
        {[...Array(4)].map((_, i) => <SkeletonCard key={i} lines={2} />)}
      </div>
    );
  }

  const questoesPct = plan && plan.dailyQuestionsGoal > 0
    ? Math.min(100, Math.round((plan.todayAnswered / plan.dailyQuestionsGoal) * 100))
    : 0;
  const flashPct = plan && plan.dailyFlashcardsGoal > 0
    ? Math.min(100, Math.round((plan.todayFlashcards / plan.dailyFlashcardsGoal) * 100))
    : 0;
  const dayPct = Math.round((questoesPct + flashPct) / 2);

  // ── Tudo concluído ─────────────────────────────────────────────────────────
  if (allDone) {
    return (
      <div className="mx-auto mt-6 flex max-w-sm flex-col items-center gap-3 rounded-2xl bg-white p-8 text-center dark:border dark:border-vinke-navy-line dark:bg-vinke-navy-card">
        <div className="relative h-[92px] w-[92px]">
          <svg viewBox="0 0 92 92" width="92" height="92">
            <circle cx="46" cy="46" r="39" fill="none" strokeWidth="9" className="stroke-vinke-green-soft" />
            <circle cx="46" cy="46" r="39" fill="none" strokeWidth="9" strokeLinecap="round"
              strokeDasharray="245 245" transform="rotate(-90 46 46)" className="stroke-vinke-green" />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center font-display text-3xl font-bold text-vinke-green-text">✓</div>
        </div>
        <span className="font-display text-xl font-bold text-vinke-ink dark:text-white">Dia completo!</span>
        <span className="text-xs leading-relaxed text-vinke-ink2 dark:text-slate-300">
          {plan?.todayAnswered ?? 0} questões e {plan?.todayFlashcards ?? 0} flashcards hoje. Amanhã tem mais.
        </span>
        <div className="mt-1 flex gap-2">
          <button
            type="button"
            onClick={() => router.push("/aluno/simulados/novo?qtd=10")}
            className="rounded-[9px] bg-vinke px-4 py-2.5 text-[11px] font-bold text-white transition hover:bg-vinke-deep"
          >
            Quero mais 10 questões
          </button>
          <button
            type="button"
            onClick={() => router.push("/aluno")}
            className="rounded-[9px] border-[1.5px] border-vinke-line px-4 py-2.5 text-[11px] font-bold text-vinke-ink dark:border-vinke-navy-line dark:text-slate-200"
          >
            Encerrar por hoje
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-6">

      {/* Header */}
      <div className="flex flex-col gap-0.5">
        <span className="font-display text-2xl font-bold text-vinke-ink dark:text-white">Estudo de hoje</span>
        <span className="text-xs font-medium text-vinke-ink3">
          {plan?.weakTheme
            ? `Seu plano prioriza ${plan.weakTheme} — é onde você mais pode subir.`
            : "Seu plano diário, montado automaticamente."}
        </span>
      </div>

      {/* Resumo com anel */}
      <div className="flex items-center gap-6 rounded-2xl bg-white p-5 dark:border dark:border-vinke-navy-line dark:bg-vinke-navy-card">
        <div className="relative h-[86px] w-[86px] shrink-0">
          <svg viewBox="0 0 86 86" width="86" height="86">
            <circle cx="43" cy="43" r="36" fill="none" strokeWidth="9" className="stroke-vinke-line2 dark:stroke-vinke-navy-sel" />
            <circle cx="43" cy="43" r="36" fill="none" strokeWidth="9" strokeLinecap="round"
              strokeDasharray={`${(dayPct / 100) * 226} 226`} transform="rotate(-90 43 43)"
              className="stroke-vinke" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-xl font-bold text-vinke-ink dark:text-white">{dayPct}%</span>
            <span className="text-[8px] font-semibold tracking-[0.1em] text-vinke-ink3">DO DIA</span>
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:gap-6">
          <MetaBar
            label="QUESTÕES"
            value={plan?.todayAnswered ?? 0}
            goal={plan?.dailyQuestionsGoal ?? 0}
          />
          <MetaBar
            label="FLASHCARDS"
            value={plan?.todayFlashcards ?? 0}
            goal={plan?.dailyFlashcardsGoal ?? 0}
          />
        </div>
      </div>

      {/* Blocos */}
      <div className="space-y-2.5">
        {blocks.map((block, i) => {
          const isNext = firstPending?.id === block.id;
          return (
            <div
              key={block.id}
              className={cn(
                "flex items-center gap-3.5 rounded-[14px] bg-white p-4 dark:bg-vinke-navy-card",
                isNext
                  ? "border-[1.5px] border-vinke"
                  : "dark:border dark:border-vinke-navy-line"
              )}
            >
              <span
                className={cn(
                  "flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] font-display text-sm font-bold",
                  block.done
                    ? "bg-vinke-green-soft text-vinke-green-text dark:bg-vinke-green/15 dark:text-vinke-green"
                    : isNext
                      ? "bg-vinke-soft text-vinke dark:bg-vinke/15 dark:text-vinke-lav"
                      : "bg-vinke-line2 text-vinke-ink2 dark:bg-vinke-navy dark:text-slate-300"
                )}
              >
                {block.done ? "✓" : i + 1}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span
                  className={cn(
                    "truncate text-[13px] font-bold",
                    block.done
                      ? "text-vinke-ink3 line-through"
                      : "text-vinke-ink dark:text-slate-100"
                  )}
                >
                  {block.title}
                </span>
                <span
                  className={cn(
                    "truncate text-[11px] font-medium",
                    block.done ? "text-vinke-green-text dark:text-vinke-green" : "text-vinke-ink3"
                  )}
                >
                  {block.subtitle}
                  {!block.done && block.estimatedMin > 0 ? ` · ~${formatMin(block.estimatedMin)}` : ""}
                </span>
              </div>
              <button
                type="button"
                onClick={() => void startBlock(block)}
                disabled={creating}
                className={cn(
                  "shrink-0 rounded-[9px] px-4 py-2 text-[11px] font-bold transition disabled:opacity-60",
                  block.done
                    ? "text-vinke-ink3 hover:text-vinke-ink dark:hover:text-slate-200"
                    : isNext
                      ? "bg-vinke text-white hover:bg-vinke-deep"
                      : "border-[1.5px] border-vinke-line text-vinke-ink hover:bg-vinke-offwhite dark:border-vinke-navy-line dark:text-slate-200 dark:hover:bg-vinke-navy-sel"
                )}
              >
                {creating && isNext ? "Preparando…" : block.action}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MetaBar({ label, value, goal }: { label: string; value: number; goal: number }) {
  const done = goal > 0 && value >= goal;
  const pct = goal > 0 ? Math.min(100, Math.round((value / goal) * 100)) : 0;
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-[10px] font-semibold tracking-[0.1em] text-vinke-ink3">{label}</span>
      <span
        className={cn(
          "font-display text-xl font-bold [font-variant-numeric:tabular-nums]",
          done ? "text-vinke-green-text dark:text-vinke-green" : "text-vinke-ink dark:text-white"
        )}
      >
        {value}
        <span className="text-[13px] font-medium text-vinke-ink3">/{goal}</span>
        {done ? " ✓" : ""}
      </span>
      <div className={cn("h-1.5 rounded-full", done ? "bg-vinke-green-soft" : "bg-vinke-line2 dark:bg-vinke-navy-sel")}>
        <div
          className={cn("h-1.5 rounded-full", done ? "bg-vinke-green" : "bg-vinke")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
