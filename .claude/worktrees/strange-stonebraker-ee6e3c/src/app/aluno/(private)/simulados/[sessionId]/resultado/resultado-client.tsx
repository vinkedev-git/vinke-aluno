"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";

import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  XCircle,
  RotateCcw,
  ListChecks,
  Plus,
  Trophy,
  Target,
  AlertTriangle,
} from "lucide-react";

type SessionDoc = {
  id: string;
  status?: "in_progress" | "completed";
  totalQuestions?: number;
  answeredCount?: number;
  correctCount?: number;
  scorePercent?: number;
  createdAt?: unknown;
  filters?: {
    temas?: unknown;
  };
  control?: boolean;
  kind?: string;
};

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function safeNum(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function formatPct(v: number) {
  if (!Number.isFinite(v)) return "—";
  return `${Math.round(v)}%`;
}

type TimestampLike = { toMillis?: () => number };

function toMillis(value: unknown): number {
  if (!value) return 0;
  if (
    typeof value === "object" &&
    value !== null &&
    "toMillis" in value &&
    typeof (value as TimestampLike).toMillis === "function"
  ) {
    return (value as TimestampLike).toMillis!();
  }
  if (typeof value === "string" || typeof value === "number" || value instanceof Date) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  }
  return 0;
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}

type ScoreLevel = {
  label: string;
  sublabel: string;
  ringColor: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
  Icon: React.ElementType;
  iconClass: string;
};

function getScoreLevel(score: number, answered: number): ScoreLevel {
  if (answered === 0) {
    return {
      label: "Sem respostas",
      sublabel: "Você não respondeu nenhuma questão.",
      ringColor: "#94a3b8",
      bgClass: "bg-slate-100 dark:bg-slate-800/50",
      textClass: "text-slate-500 dark:text-slate-400",
      borderClass: "border-slate-200 dark:border-slate-700",
      Icon: AlertTriangle,
      iconClass: "text-slate-400",
    };
  }
  if (score >= 70) {
    return {
      label: "Excelente! 🎉",
      sublabel: "Você atingiu a meta de aproveitamento.",
      ringColor: "#22c55e",
      bgClass: "bg-emerald-50 dark:bg-emerald-950/30",
      textClass: "text-emerald-700 dark:text-emerald-300",
      borderClass: "border-emerald-200 dark:border-emerald-900/40",
      Icon: Trophy,
      iconClass: "text-emerald-500",
    };
  }
  if (score >= 50) {
    return {
      label: "Bom trabalho!",
      sublabel: "Continue praticando para atingir 70%.",
      ringColor: "#f59e0b",
      bgClass: "bg-amber-50 dark:bg-amber-950/30",
      textClass: "text-amber-700 dark:text-amber-300",
      borderClass: "border-amber-200 dark:border-amber-900/40",
      Icon: Target,
      iconClass: "text-amber-500",
    };
  }
  return {
    label: "Continue tentando!",
    sublabel: "Revise os temas e tente novamente.",
    ringColor: "#ef4444",
    bgClass: "bg-rose-50 dark:bg-rose-950/30",
    textClass: "text-rose-700 dark:text-rose-300",
    borderClass: "border-rose-200 dark:border-rose-900/40",
    Icon: RotateCcw,
    iconClass: "text-rose-500",
  };
}

// SVG ring gauge — circumference of r=54 circle ≈ 339.3
const RING_R = 54;
const RING_CIRC = 2 * Math.PI * RING_R;

function ScoreRing({ score, ringColor }: { score: number; ringColor: string }) {
  const offset = RING_CIRC * (1 - Math.max(0, Math.min(100, score)) / 100);
  return (
    <svg viewBox="0 0 140 140" className="h-36 w-36">
      {/* Track */}
      <circle
        cx="70" cy="70" r={RING_R}
        fill="none"
        strokeWidth="12"
        stroke="currentColor"
        className="text-slate-100 dark:text-slate-800"
      />
      {/* 70% goal arc (faint green) */}
      <circle
        cx="70" cy="70" r={RING_R}
        fill="none"
        strokeWidth="12"
        stroke="#22c55e"
        opacity="0.18"
        strokeDasharray={`${RING_CIRC * 0.7} ${RING_CIRC}`}
        strokeLinecap="round"
        transform="rotate(-90 70 70)"
      />
      {/* Score arc */}
      <circle
        cx="70" cy="70" r={RING_R}
        fill="none"
        strokeWidth="12"
        stroke={ringColor}
        strokeDasharray={`${RING_CIRC - offset} ${RING_CIRC}`}
        strokeDashoffset={0}
        strokeLinecap="round"
        transform="rotate(-90 70 70)"
        style={{ transition: "stroke-dasharray 0.6s ease" }}
      />
      {/* Score text */}
      <text
        x="70" y="65"
        textAnchor="middle"
        fontSize="26"
        fontWeight="900"
        fill={ringColor}
      >
        {Math.round(score)}%
      </text>
      <text
        x="70" y="83"
        textAnchor="middle"
        fontSize="11"
        fill="currentColor"
        className="fill-slate-400"
        fontWeight="600"
      >
        aproveitamento
      </text>
    </svg>
  );
}

export default function ResultadoClient({ sessionId }: { sessionId: string }) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [session, setSession] = useState<SessionDoc | null>(null);
  const [simuladoNumero, setSimuladoNumero] = useState<number | null>(null);

  const load = useCallback(async () => {
    const u = auth.currentUser;
    if (!u) {
      setErr("Você precisa estar logado.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setErr("");

    try {
      const sessionsRef = collection(db, "users", u.uid, "sessions");
      const ref = doc(sessionsRef, sessionId);

      const [snap, listSnap] = await Promise.all([
        getDoc(ref),
        getDocs(sessionsRef),
      ]);

      if (!snap.exists()) throw new Error("Sessão não encontrada.");
      setSession({ id: snap.id, ...(snap.data() as Omit<SessionDoc, "id">) });

      const allSessions = listSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<SessionDoc, "id">),
      }));
      allSessions.sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
      const index = allSessions.findIndex((item) => item.id === sessionId);
      setSimuladoNumero(index >= 0 ? index + 1 : null);
    } catch (error: unknown) {
      console.error(error);
      setErr(getErrorMessage(error, "Falha ao carregar resultado."));
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const total = safeNum(session?.totalQuestions);
    const answeredRaw = safeNum(session?.answeredCount);
    const answered = total > 0 ? Math.min(answeredRaw, total) : answeredRaw;
    const correct = safeNum(session?.correctCount);
    const errors = Math.max(0, answered - correct);
    const score =
      session?.scorePercent != null
        ? safeNum(session?.scorePercent)
        : total > 0
        ? (correct / total) * 100
        : 0;
    return { total, answered, correct, errors, score };
  }, [session]);

  const temas = useMemo(() => toStringList(session?.filters?.temas), [session]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
        <div className="h-64 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
          ))}
        </div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-5 dark:border-rose-900/40 dark:bg-rose-950/30">
        <div className="font-semibold text-rose-700 dark:text-rose-300">{err}</div>
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" onClick={() => router.push("/aluno/simulados")}>Voltar</Button>
          <Button onClick={load}>Tentar novamente</Button>
        </div>
      </div>
    );
  }

  if (!session) return null;

  const title = `Simulado ${String(simuladoNumero ?? 1).padStart(2, "0")}`;
  const level = getScoreLevel(stats.score, stats.answered);
  const { Icon: LevelIcon } = level;

  const correctPct = stats.answered > 0 ? (stats.correct / stats.answered) * 100 : 0;
  const errorPct = stats.answered > 0 ? (stats.errors / stats.answered) * 100 : 0;

  return (
    <div className="space-y-5">

      {/* Page header */}
      <div>
        <div className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-500">
          Resultado final
        </div>
        <div className="mt-0.5 text-3xl font-black text-slate-900 dark:text-slate-100">{title}</div>
      </div>

      {/* Hero card */}
      <div className={cn(
        "rounded-2xl border p-6",
        level.bgClass, level.borderClass
      )}>
        <div className="flex flex-col items-center gap-6 sm:flex-row">
          {/* Ring gauge */}
          <div className="shrink-0">
            <ScoreRing score={stats.score} ringColor={level.ringColor} />
          </div>

          {/* Result message + info */}
          <div className="flex-1 text-center sm:text-left">
            <div className="flex items-center justify-center gap-2 sm:justify-start">
              <LevelIcon size={22} className={level.iconClass} />
              <div className={cn("text-2xl font-black", level.textClass)}>
                {level.label}
              </div>
            </div>
            <div className={cn("mt-1 text-sm font-medium", level.textClass, "opacity-80")}>
              {level.sublabel}
            </div>

            {/* Themes */}
            {temas.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5 justify-center sm:justify-start">
                {temas.slice(0, 5).map((t) => (
                  <span
                    key={t}
                    className="rounded-full border border-slate-200 bg-white/70 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300"
                  >
                    {t}
                  </span>
                ))}
                {temas.length > 5 && (
                  <span className="rounded-full border border-slate-200 bg-white/70 px-2.5 py-0.5 text-xs font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800/70">
                    +{temas.length - 5}
                  </span>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="mt-5 flex flex-wrap gap-2 justify-center sm:justify-start">
              <Button
                onClick={() => router.push(`/aluno/simulados/${sessionId}`)}
                className="gap-2"
              >
                <ListChecks size={15} />
                Revisar questões
              </Button>
              <Button
                variant="secondary"
                onClick={() => router.push("/aluno/simulados/novo")}
                className="gap-2"
              >
                <Plus size={15} />
                Novo simulado
              </Button>
              <Button
                variant="secondary"
                onClick={() => router.push("/aluno/simulados")}
                className="gap-1.5"
              >
                Ver todos
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800/80 dark:bg-slate-900/50">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-500">Nota</div>
          <div className="mt-1 text-3xl font-black" style={{ color: level.ringColor }}>
            {formatPct(stats.score)}
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-500">aproveitamento</div>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900/30 dark:bg-emerald-950/20">
          <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-500">Acertos</div>
          <div className="mt-1 text-3xl font-black text-emerald-700 dark:text-emerald-300">{stats.correct}</div>
          <div className="mt-0.5 text-xs text-emerald-600/70 dark:text-emerald-500/70">{formatPct(correctPct)} das respondidas</div>
        </div>

        <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4 dark:border-rose-900/30 dark:bg-rose-950/20">
          <div className="text-[11px] font-bold uppercase tracking-wide text-rose-500 dark:text-rose-400">Erros</div>
          <div className="mt-1 text-3xl font-black text-rose-600 dark:text-rose-400">{stats.errors}</div>
          <div className="mt-0.5 text-xs text-rose-500/70 dark:text-rose-400/70">{formatPct(errorPct)} das respondidas</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800/80 dark:bg-slate-900/50">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-500">Questões</div>
          <div className="mt-1 text-3xl font-black text-slate-900 dark:text-slate-100">
            {stats.answered}
            {stats.total > 0 && (
              <span className="text-base font-semibold text-slate-400 dark:text-slate-600">/{stats.total}</span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-500">respondidas</div>
        </div>
      </div>

      {/* Breakdown bar */}
      {stats.answered > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800/80 dark:bg-slate-900/50">
          <div className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-300">Distribuição de respostas</div>

          {/* Stacked bar */}
          <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="flex h-full">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${correctPct}%` }}
              />
              <div
                className="h-full bg-rose-400 transition-all"
                style={{ width: `${errorPct}%` }}
              />
            </div>
          </div>

          {/* Legend */}
          <div className="mt-3 flex flex-wrap gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 size={13} className="text-emerald-500" />
              <span className="text-slate-600 dark:text-slate-400">
                <span className="font-bold text-emerald-600 dark:text-emerald-400">{stats.correct}</span> acertos ({formatPct(correctPct)})
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <XCircle size={13} className="text-rose-400" />
              <span className="text-slate-600 dark:text-slate-400">
                <span className="font-bold text-rose-500 dark:text-rose-400">{stats.errors}</span> erros ({formatPct(errorPct)})
              </span>
            </div>
            {stats.total > stats.answered && (
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-full bg-slate-200 dark:bg-slate-700" />
                <span className="text-slate-500 dark:text-slate-500">
                  {stats.total - stats.answered} não respondidas
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 70% goal note */}
      {stats.answered > 0 && stats.score < 70 && (
        <div className="rounded-2xl border border-indigo-200/60 bg-indigo-50/60 px-4 py-3 dark:border-indigo-900/30 dark:bg-indigo-950/20">
          <div className="flex items-start gap-2.5">
            <Target size={15} className="mt-0.5 shrink-0 text-indigo-500" />
            <div className="text-sm text-indigo-700 dark:text-indigo-300">
              <span className="font-bold">Meta: 70% de aproveitamento.</span>{" "}
              {stats.score >= 50
                ? `Você está a apenas ${Math.ceil(70 - stats.score)} p.p. da meta. Continue praticando!`
                : "Revise os temas e crie um novo simulado focado nos conteúdos que você mais errou."}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
