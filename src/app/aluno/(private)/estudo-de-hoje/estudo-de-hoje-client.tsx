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

      // Flashcards disponiveis hoje (SM-2). O helper ja aplica o teto diario —
      // nao envolver em Math.min de novo aqui.
      const flashcardsDue = fcOverview.due;

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
        <div className="h-8 w-56 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
        <div className="h-20 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
        {[...Array(4)].map((_, i) => <SkeletonCard key={i} lines={2} />)}
      </div>
    );
  }

  const colorMap = {
    amber:  { border: "border-amber-200 dark:border-amber-900/40",  bg: "bg-amber-50 dark:bg-amber-950/20",  icon: "from-amber-500 to-orange-500", text: "text-amber-700 dark:text-amber-300" },
    indigo: { border: "border-indigo-200 dark:border-indigo-900/40", bg: "bg-indigo-50 dark:bg-indigo-950/20", icon: "from-indigo-500 to-blue-500",   text: "text-indigo-700 dark:text-indigo-300" },
    rose:   { border: "border-rose-200 dark:border-rose-900/40",    bg: "bg-rose-50 dark:bg-rose-950/20",    icon: "from-rose-500 to-orange-500",   text: "text-rose-700 dark:text-rose-300" },
    blue:   { border: "border-blue-200 dark:border-blue-900/40",    bg: "bg-blue-50 dark:bg-blue-950/20",    icon: "from-blue-500 to-cyan-500",     text: "text-blue-700 dark:text-blue-300" },
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">

      {/* Header */}
      <div>
        <div className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-500">
          {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
        </div>
        <div className="mt-0.5 text-3xl font-black text-slate-900 dark:text-slate-100">
          Estudo de hoje
        </div>
        <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {allDone
            ? "Parabéns! Você concluiu seu plano de hoje. 🎉"
            : "Seu plano diário montado automaticamente."}
        </div>
      </div>

      {/* Resumo do plano */}
      <div className={cn(
        "rounded-2xl border p-4",
        allDone
          ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20"
          : "border-slate-200 bg-white dark:border-slate-800/80 dark:bg-slate-900/50"
      )}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            {/* Progresso */}
            <div className="flex items-center gap-2">
              <div className="relative h-10 w-10">
                <svg className="h-10 w-10 -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="14" fill="none" stroke="currentColor" strokeWidth="3"
                    className="text-slate-200 dark:text-slate-700" />
                  <circle cx="18" cy="18" r="14" fill="none" stroke="currentColor" strokeWidth="3"
                    strokeDasharray={`${(doneCount / Math.max(1, blocks.length)) * 88} 88`}
                    className={allDone ? "text-emerald-500" : "text-indigo-500"}
                    strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-[11px] font-black text-slate-700 dark:text-slate-300">
                  {doneCount}/{blocks.length}
                </div>
              </div>
              <div>
                <div className="text-sm font-black text-slate-900 dark:text-slate-100">
                  {allDone ? "Tudo concluído!" : `${blocks.length - doneCount} bloco${blocks.length - doneCount > 1 ? "s" : ""} restante${blocks.length - doneCount > 1 ? "s" : ""}`}
                </div>
                {!allDone && (
                  <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                    <Clock size={11} />
                    ~{formatMin(totalMin)} estimados
                  </div>
                )}
              </div>
            </div>

            {/* Tema prioritário */}
            {plan?.weakTheme && (
              <div className="flex items-center gap-1.5 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-1 dark:border-amber-900/40 dark:bg-amber-950/30">
                <Target size={12} className="text-amber-600 dark:text-amber-400" />
                <span className="text-xs font-bold text-amber-700 dark:text-amber-300">
                  Foco: {plan.weakTheme}
                </span>
              </div>
            )}
          </div>

          {/* CTA principal */}
          {!allDone && firstPending && (
            <Button
              onClick={() => startBlock(firstPending)}
              disabled={creating}
              className="w-full gap-2 sm:w-auto"
            >
              <Zap size={14} />
              {creating ? "Preparando…" : "Começar agora"}
            </Button>
          )}
        </div>
      </div>

      {/* Blocos */}
      <div className="space-y-3">
        {blocks.map((block, i) => {
          const c = colorMap[block.color];
          return (
            <div
              key={block.id}
              className={cn(
                "rounded-2xl border p-4 transition",
                block.done
                  ? "border-slate-200 bg-white opacity-60 dark:border-slate-800/80 dark:bg-slate-900/30"
                  : cn(c.border, c.bg)
              )}
            >
              <div className="flex items-start gap-3">
                {/* Número / check */}
                <div className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white",
                  block.done
                    ? "bg-emerald-500"
                    : `bg-gradient-to-br ${c.icon}`
                )}>
                  {block.done
                    ? <CheckCircle2 size={18} />
                    : block.icon}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-slate-900 dark:text-slate-100">
                      {block.title}
                    </span>
                    {!block.done && block.estimatedMin > 0 && (
                      <span className="flex items-center gap-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                        <Clock size={10} />
                        ~{formatMin(block.estimatedMin)}
                      </span>
                    )}
                  </div>
                  <div className={cn(
                    "mt-0.5 text-xs",
                    block.done ? "text-slate-400 dark:text-slate-500" : "text-slate-600 dark:text-slate-300"
                  )}>
                    {block.subtitle}
                  </div>
                </div>

                {/* Botão de ação */}
                <button
                  type="button"
                  disabled={creating}
                  onClick={() => startBlock(block)}
                  className={cn(
                    "flex shrink-0 items-center gap-1 rounded-xl border px-3 py-1.5 text-xs font-bold transition",
                    block.done
                      ? "border-slate-200 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-900"
                      : cn(
                          "text-white",
                          block.color === "amber"  && "border-amber-500 bg-gradient-to-r from-amber-500 to-orange-500",
                          block.color === "indigo" && "border-indigo-500 bg-gradient-to-r from-indigo-500 to-blue-500",
                          block.color === "rose"   && "border-rose-500 bg-gradient-to-r from-rose-500 to-orange-500",
                          block.color === "blue"   && "border-blue-500 bg-gradient-to-r from-blue-500 to-cyan-500"
                        )
                  )}
                >
                  {block.action}
                  {!block.done && <ChevronRight size={12} />}
                </button>
              </div>

              {/* Número de ordem quando pendente */}
              {!block.done && (
                <div className="mt-2 flex items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    Bloco {i + 1 - doneCount} de {blocks.length - doneCount}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Estado vazio — sem dados */}
      {!plan && (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800/80 dark:bg-slate-900/50">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800">
            <Sparkles size={24} className="text-slate-400" />
          </div>
          <div className="mt-3 text-base font-black text-slate-900 dark:text-slate-100">
            Ainda não temos seu plano
          </div>
          <div className="mx-auto mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">
            Responda algumas questões ou configure suas metas diárias para montar o Estudo de Hoje.
          </div>
          <Button className="mt-4 gap-2" onClick={() => router.push("/aluno/configuracoes")}>
            <Target size={14} />
            Configurar metas
          </Button>
        </div>
      )}

      {/* Nota de rodapé */}
      <div className="text-center text-xs text-slate-400 dark:text-slate-600">
        O plano é recalculado automaticamente conforme você estuda.
      </div>
    </div>
  );
}
