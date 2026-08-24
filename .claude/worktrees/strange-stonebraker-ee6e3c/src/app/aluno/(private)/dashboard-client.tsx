"use client";

import { useEffect, useMemo, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { collection, doc, getDoc, getDocs, limit, orderBy, query } from "firebase/firestore";
import { useRouter } from "next/navigation";

import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SkeletonDashboard } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Minus, ChevronRight, BookOpen, Zap, Layers, Flame, CalendarDays, CheckCircle2, NotebookPen, AlertTriangle, Sparkles } from "lucide-react";
import { getDailyStatus } from "@/lib/daily";

type SessionDoc = {
  id: string;
  status?: "in_progress" | "completed";
  totalQuestions?: number;
  answeredCount?: number;
  correctCount?: number;
  scorePercent?: number;
  updatedAt?: unknown;
  createdAt?: unknown;
  title?: string;
  questionIds?: unknown;
  answersMap?: Record<string, { isCorrect?: boolean }>;
  filters?: {
    temas?: string[];
  };
  control?: boolean;
  kind?: string;
};

type TimestampLike = {
  toMillis?: () => number;
};

type QuestionThemeDoc = {
  themes?: unknown;
  tema?: unknown;
  theme?: unknown;
  topic?: unknown;
};

type ThemePerformance = {
  theme: string;
  total: number;
  correct: number;
  wrong: number;
  accuracy: number;
};

type DashboardCache = {
  ts: number;
  sessions: SessionDoc[];
  themePerformance: ThemePerformance[];
};

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function normalizeQuestionIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        const raw = item as { id?: unknown; questionId?: unknown };
        if (typeof raw.id === "string") return raw.id.trim();
        if (typeof raw.questionId === "string") return raw.questionId.trim();
      }
      return "";
    })
    .filter(Boolean);
}

function extractQuestionThemes(question: QuestionThemeDoc): string[] {
  const fromList = toStringList(question.themes);
  if (fromList.length) return fromList;

  const singleCandidates = [question.tema, question.theme, question.topic];
  for (const candidate of singleCandidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return [candidate.trim()];
    }
  }

  return [];
}

function formatPct(v: number) {
  if (!Number.isFinite(v)) return "—";
  return `${Math.round(v)}%`;
}

function safeNum(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function tsToMs(v: unknown): number {
  if (!v) return 0;
  if (typeof v === "object" && v !== null && "toMillis" in v && typeof (v as TimestampLike).toMillis === "function") {
    return (v as TimestampLike).toMillis!();
  }
  if (typeof v === "string" || typeof v === "number" || v instanceof Date) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  }
  return 0;
}

function formatSimuladoNumber(n: number | null | undefined) {
  return `Simulado ${String(n || 1).padStart(2, "0")}`;
}

function formatRelativeStudyTime(ms: number) {
  if (!ms) return "Sem atividade recente";
  const diff = Date.now() - ms;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < hour) return "Estudou há menos de 1h";
  if (diff < day) return `Estudou há ${Math.max(1, Math.floor(diff / hour))}h`;
  const days = Math.max(1, Math.floor(diff / day));
  return days === 1 ? "Último estudo: ontem" : `Último estudo: há ${days} dias`;
}

const DASHBOARD_CACHE_TTL_MS = 60_000;
const DASHBOARD_CACHE_KEY = "aq.aluno.dashboard.cache";

function readDashboardCache(uid: string): DashboardCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(`${DASHBOARD_CACHE_KEY}.${uid}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DashboardCache;
    if (!parsed || typeof parsed.ts !== "number") return null;
    if (Date.now() - parsed.ts > DASHBOARD_CACHE_TTL_MS) return null;
    if (!Array.isArray(parsed.sessions) || !Array.isArray(parsed.themePerformance)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeDashboardCache(uid: string, value: DashboardCache) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(`${DASHBOARD_CACHE_KEY}.${uid}`, JSON.stringify(value));
  } catch {
    // noop
  }
}

async function buildThemePerformance(items: SessionDoc[]): Promise<ThemePerformance[]> {
  const byTheme = new Map<string, { correct: number; wrong: number; total: number }>();
  const completed = items.filter((s) => s.status === "completed").slice(0, 8);

  const questionToSessionThemes = new Map<string, string[]>();
  const qidSet = new Set<string>();

  for (const session of completed) {
    const qids = normalizeQuestionIds(session.questionIds);
    const fallbackThemes = toStringList(session.filters?.temas);
    for (const qid of qids) {
      if (!qid) continue;
      qidSet.add(qid);
      if (fallbackThemes.length) {
        questionToSessionThemes.set(qid, fallbackThemes);
      }
    }
  }

  const allQids = Array.from(qidSet).slice(0, 120);
  const docs = await Promise.all(
    allQids.map(async (qid) => {
      try {
        const qSnap = await getDoc(doc(db, "questionsBank", qid));
        if (!qSnap.exists()) return [qid, [] as string[]] as const;
        const themes = extractQuestionThemes(qSnap.data() as QuestionThemeDoc);
        return [qid, themes] as const;
      } catch {
        return [qid, [] as string[]] as const;
      }
    })
  );

  const themeCache = new Map<string, string[]>(docs);

  for (const session of completed) {
    const qids = normalizeQuestionIds(session.questionIds);
    const fallbackThemes = toStringList(session.filters?.temas);

    for (const qid of qids) {
      const answer = session.answersMap?.[qid];
      if (!answer) continue;

      const fetchedThemes = themeCache.get(qid) ?? [];
      const themes =
        fetchedThemes.length > 0
          ? fetchedThemes
          : questionToSessionThemes.get(qid) ?? fallbackThemes;

      for (const theme of themes) {
        const current = byTheme.get(theme) ?? { correct: 0, wrong: 0, total: 0 };
        current.total += 1;
        if (answer.isCorrect) current.correct += 1;
        else current.wrong += 1;
        byTheme.set(theme, current);
      }
    }
  }

  return Array.from(byTheme.entries())
    .map(([theme, agg]) => ({
      theme,
      total: agg.total,
      correct: agg.correct,
      wrong: agg.wrong,
      accuracy: agg.total > 0 ? (agg.correct / agg.total) * 100 : 0,
    }))
    .sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      return b.accuracy - a.accuracy;
    });
}

function ProgressBar({ label, value, goal, color }: { label: string; value: number; goal: number; color: "indigo" | "blue" }) {
  const pct = goal > 0 ? Math.min(100, Math.round((value / goal) * 100)) : 0;
  const done = value >= goal;
  const barColor = color === "indigo"
    ? "bg-gradient-to-r from-indigo-500 to-blue-500"
    : "bg-gradient-to-r from-blue-500 to-cyan-500";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-400">
        <span className="flex items-center gap-1">
          {done && <CheckCircle2 size={12} className="text-emerald-500" />}
          {label}
        </span>
        <span className={done ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500 dark:text-slate-400"}>
          {value} / {goal}
          {done && " ✓"}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className={cn("h-full rounded-full transition-all duration-500", barColor)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function DashboardClient() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [sessions, setSessions] = useState<SessionDoc[]>([]);
  const [themePerformance, setThemePerformance] = useState<ThemePerformance[]>([]);
  const [firestoreName, setFirestoreName] = useState("");
  const [flashcardStats, setFlashcardStats] = useState({ studied: 0, due: 0, mastered: 0 });
  const [streakCount, setStreakCount] = useState(0);
  const [daily, setDaily] = useState<{ exists: boolean; answered: boolean } | null>(null);
  const [todayProgress, setTodayProgress] = useState({ questions: 0, flashcards: 0 });
  const [dailyGoals, setDailyGoals] = useState({ questionsGoal: 20, flashcardsGoal: 10 });
  const [errorNotebookCount, setErrorNotebookCount] = useState(0);
  const [allTimeByTheme, setAllTimeByTheme] = useState<Record<string, { total: number; correct: number }>>({});
  const [resumeWindow, setResumeWindow] = useState<"7d" | "30d">("7d");

  async function load({ keepVisible = false }: { keepVisible?: boolean } = {}) {
    const u = auth.currentUser;
    if (!u) {
      setErr("Você precisa estar logado.");
      setLoading(false);
      return;
    }

    if (!keepVisible) setLoading(true);
    setErr("");

    try {
      const ref = collection(db, "users", u.uid, "sessions");
      const qy = query(ref, orderBy("updatedAt", "desc"), limit(80));

      const [snap, userSnap, fcSnap, statsSnap, settingsSnap, dailyStatus, errorSnap] = await Promise.all([
        getDocs(qy),
        getDoc(doc(db, "users", u.uid)),
        getDocs(collection(db, "users", u.uid, "flashcards")),
        getDoc(doc(db, "users", u.uid, "meta", "stats")),
        getDoc(doc(db, "users", u.uid, "meta", "settings")),
        getDailyStatus(u.uid),
        getDocs(collection(db, "users", u.uid, "errorNotebook")),
      ]);

      if (userSnap.exists()) {
        const userData = userSnap.data() as { name?: string };
        const rawName = (userData.name || "").trim();
        if (rawName) setFirestoreName(rawName.split(" ")[0]);
      }

      if (statsSnap.exists()) {
        const s = statsSnap.data() as {
          streakCount?: number;
          todayAnswered?: number;
          todayFlashcards?: number;
          byTheme?: Record<string, { total?: number; correct?: number }>;
        };
        setStreakCount(Number(s.streakCount ?? 0));
        setTodayProgress({
          questions: Number(s.todayAnswered ?? 0),
          flashcards: Number(s.todayFlashcards ?? 0),
        });
        if (s.byTheme) {
          const normalized: Record<string, { total: number; correct: number }> = {};
          for (const [t, v] of Object.entries(s.byTheme)) {
            normalized[t] = { total: Number(v?.total ?? 0), correct: Number(v?.correct ?? 0) };
          }
          setAllTimeByTheme(normalized);
        }
      }

      // Caderno de erros — contagem de pendentes
      setErrorNotebookCount(
        errorSnap.docs.filter((d) => {
          const data = d.data() as { status?: string };
          return (data.status ?? "pending") === "pending";
        }).length
      );
      if (settingsSnap.exists()) {
        const s = settingsSnap.data() as { dailyQuestionsGoal?: number; dailyFlashcardsGoal?: number };
        setDailyGoals({
          questionsGoal: Number(s.dailyQuestionsGoal ?? 20),
          flashcardsGoal: Number(s.dailyFlashcardsGoal ?? 10),
        });
      }
      setDaily(dailyStatus ? { exists: dailyStatus.exists, answered: dailyStatus.answered } : null);

      {
        const fcDocs = fcSnap.docs.map((d) => d.data() as { box?: number; nextReview?: unknown });
        const nowMs = Date.now();
        setFlashcardStats({
          studied: fcDocs.length,
          due: fcDocs.filter((fc) => tsToMs(fc.nextReview) <= nowMs).length,
          mastered: fcDocs.filter((fc) => (fc.box ?? 1) >= 4).length,
        });
      }

      const items: SessionDoc[] = snap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<SessionDoc, "id">),
      }));

      items.sort((a, b) => tsToMs(b.updatedAt) - tsToMs(a.updatedAt));
      setSessions(items);
      void buildThemePerformance(items)
        .then((perf) => {
          setThemePerformance(perf);
          writeDashboardCache(u.uid, {
            ts: Date.now(),
            sessions: items,
            themePerformance: perf,
          });
        })
        .catch((error) => {
          console.error("Falha ao calcular performance por tema:", error);
          writeDashboardCache(u.uid, {
            ts: Date.now(),
            sessions: items,
            themePerformance: [],
          });
        });
    } catch (error: unknown) {
      console.error(error);
      setErr(getErrorMessage(error, "Falha ao carregar dados do dashboard."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const u = auth.currentUser;
    if (u) {
      const cached = readDashboardCache(u.uid);
      if (cached) {
        setSessions(cached.sessions);
        setThemePerformance(cached.themePerformance);
        setLoading(false);
        void load({ keepVisible: true });
        return;
      }
    }
    void load();
  }, []);

  const stats = useMemo(() => {
    const totalSimulados = sessions.length;
    const concluidos = sessions.filter((s) => s.status === "completed").length;

    const totalQuestoes = sessions.reduce((acc, s) => acc + safeNum(s.totalQuestions), 0);
    const respondidas = sessions.reduce((acc, s) => acc + safeNum(s.answeredCount), 0);
    const acertos = sessions.reduce((acc, s) => acc + safeNum(s.correctCount), 0);

    const progressoPct = totalQuestoes > 0 ? (respondidas / totalQuestoes) * 100 : 0;
    const aproveitamentoPct = respondidas > 0 ? (acertos / respondidas) * 100 : 0;

    return {
      totalSimulados,
      concluidos,
      totalQuestoes,
      respondidas,
      acertos,
      progressoPct,
      aproveitamentoPct,
    };
  }, [sessions]);

  const lastSession = useMemo(() => sessions[0] ?? null, [sessions]);
  const inProgressSession = useMemo(
    () => sessions.find((session) => session.status !== "completed") ?? null,
    [sessions]
  );
  const recentTop3 = useMemo(() => sessions.slice(0, 3), [sessions]);
  const sessionNumberById = useMemo(() => {
    const map = new Map<string, number>();
    const ordered = [...sessions].sort((a, b) => {
      const aCreated = tsToMs(a.createdAt);
      const bCreated = tsToMs(b.createdAt);
      if (aCreated !== bCreated) return aCreated - bCreated;
      return tsToMs(a.updatedAt) - tsToMs(b.updatedAt);
    });
    ordered.forEach((session, index) => {
      map.set(session.id, index + 1);
    });
    return map;
  }, [sessions]);
  const topThemes = useMemo(() => [...themePerformance].sort((a, b) => b.accuracy - a.accuracy).slice(0, 3), [themePerformance]);
  const weakThemes = useMemo(() => [...themePerformance].sort((a, b) => a.accuracy - b.accuracy).slice(0, 3), [themePerformance]);
  const needsFocus = weakThemes[0] ?? null;
  const bestTheme = topThemes[0] ?? null;
  const performanceSeries = useMemo(() => {
    return [...sessions]
      .slice(0, 8)
      .reverse()
      .map((s) => {
        const total = safeNum(s.totalQuestions);
        const answered = total > 0 ? Math.min(safeNum(s.answeredCount), total) : safeNum(s.answeredCount);
        const pct =
          s.status === "completed"
            ? safeNum(s.scorePercent)
            : total > 0
            ? (answered / total) * 100
            : 0;
        const number = sessionNumberById.get(s.id) ?? 1;
        return {
          id: s.id,
          label: `S${String(number).padStart(2, "0")}`,
          value: Math.max(0, Math.min(100, pct)),
        };
      });
  }, [sessions, sessionNumberById]);
  const now = Date.now();
  const last7dStart = now - 7 * 24 * 60 * 60 * 1000;
  const prev7dStart = now - 14 * 24 * 60 * 60 * 1000;
  const last30dStart = now - 30 * 24 * 60 * 60 * 1000;
  const sessionsLast7d = useMemo(
    () => sessions.filter((s) => tsToMs(s.updatedAt || s.createdAt) >= last7dStart),
    [sessions, last7dStart]
  );
  const sessionsPrev7d = useMemo(
    () =>
      sessions.filter((s) => {
        const ts = tsToMs(s.updatedAt || s.createdAt);
        return ts >= prev7dStart && ts < last7dStart;
      }),
    [sessions, prev7dStart, last7dStart]
  );
  const stats7d = useMemo(() => {
    const answered = sessionsLast7d.reduce((acc, s) => acc + safeNum(s.answeredCount), 0);
    const correct = sessionsLast7d.reduce((acc, s) => acc + safeNum(s.correctCount), 0);
    const completed = sessionsLast7d.filter((s) => s.status === "completed").length;
    const accuracy = answered > 0 ? (correct / answered) * 100 : 0;
    return { answered, correct, completed, accuracy };
  }, [sessionsLast7d]);
  const prevAccuracy7d = useMemo(() => {
    const answered = sessionsPrev7d.reduce((acc, s) => acc + safeNum(s.answeredCount), 0);
    const correct = sessionsPrev7d.reduce((acc, s) => acc + safeNum(s.correctCount), 0);
    return answered > 0 ? (correct / answered) * 100 : 0;
  }, [sessionsPrev7d]);
  const sessionsLast30d = useMemo(
    () => sessions.filter((s) => tsToMs(s.updatedAt || s.createdAt) >= last30dStart),
    [sessions, last30dStart]
  );
  const stats30d = useMemo(() => {
    const answered = sessionsLast30d.reduce((acc, s) => acc + safeNum(s.answeredCount), 0);
    const correct = sessionsLast30d.reduce((acc, s) => acc + safeNum(s.correctCount), 0);
    const completed = sessionsLast30d.filter((s) => s.status === "completed").length;
    const accuracy = answered > 0 ? (correct / answered) * 100 : 0;
    return { answered, correct, completed, accuracy };
  }, [sessionsLast30d]);

  // Stats da janela selecionada (7d ou 30d)
  const activeWindowStats = resumeWindow === "7d" ? stats7d : stats30d;
  const activeWindowLabel = resumeWindow === "7d" ? "Últimos 7 dias" : "Últimos 30 dias";

  // Insights consultivos baseados nas stats agregadas de tema
  const themeInsights = useMemo(() => {
    const entries = Object.entries(allTimeByTheme)
      .filter(([, v]) => v.total >= 5)
      .map(([theme, v]) => ({ theme, total: v.total, correct: v.correct, acc: v.total > 0 ? (v.correct / v.total) * 100 : 0 }))
      .sort((a, b) => b.total - a.total);

    const weakest = [...entries].sort((a, b) => a.acc - b.acc)[0] ?? null;
    const strongest = [...entries].sort((a, b) => b.acc - a.acc)[0] ?? null;
    const mostAnswered = entries[0] ?? null;

    // Tema com queda recente: compara 7d vs acumulado
    let falling: { theme: string; recentAcc: number; allTimeAcc: number } | null = null;
    if (sessionsLast7d.length >= 2) {
      const recent7dByTheme: Record<string, { total: number; correct: number }> = {};
      for (const s of sessionsLast7d) {
        // Usamos o approx de scorePercent/answeredCount da sessão como proxy
        const sessionThemes = s.filters?.temas ?? [];
        for (const t of sessionThemes) {
          if (!recent7dByTheme[t]) recent7dByTheme[t] = { total: 0, correct: 0 };
          recent7dByTheme[t].total += safeNum(s.answeredCount);
          recent7dByTheme[t].correct += safeNum(s.correctCount);
        }
      }
      let worstDrop = 0;
      for (const [t, v] of Object.entries(recent7dByTheme)) {
        if (v.total < 5) continue;
        const recentAcc = v.total > 0 ? (v.correct / v.total) * 100 : 0;
        const allTimeAcc = allTimeByTheme[t] ? (allTimeByTheme[t].correct / allTimeByTheme[t].total) * 100 : recentAcc;
        const drop = allTimeAcc - recentAcc;
        if (drop > 8 && drop > worstDrop) {
          worstDrop = drop;
          falling = { theme: t, recentAcc, allTimeAcc };
        }
      }
    }

    return { weakest, strongest, mostAnswered, falling };
  }, [allTimeByTheme, sessionsLast7d]);

  const trendLabel = useMemo(() => {
    if (sessionsPrev7d.length === 0 || sessionsLast7d.length === 0) return "Sem comparação suficiente";
    const diff = stats7d.accuracy - prevAccuracy7d;
    if (Math.abs(diff) < 1) return "Tendência estável";
    return diff > 0 ? `Subiu ${Math.round(diff)} p.p. vs semana anterior` : `Caiu ${Math.round(Math.abs(diff))} p.p. vs semana anterior`;
  }, [sessionsPrev7d.length, sessionsLast7d.length, stats7d.accuracy, prevAccuracy7d]);

  if (loading) {
    return <SkeletonDashboard />;
  }

  if (err) {
    return (
      <div className="space-y-6">
        <div>
          <div className="text-3xl font-black text-slate-900 dark:text-slate-100">Início</div>
          <div className="text-sm text-slate-600 mt-1 dark:text-slate-400">Visão geral do seu desempenho</div>
        </div>

        <div className="rounded-3xl border bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-rose-700 font-semibold dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
            {err}
          </div>

          <Button className="mt-4" onClick={() => void load()}>
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  const progressoLabel =
    stats.totalQuestoes > 0 ? `${stats.respondidas} / ${stats.totalQuestoes}` : "—";

  const resolvidasLabel = stats.respondidas > 0 ? String(stats.respondidas) : "—";
  const aproveitamentoLabel = stats.respondidas > 0 ? formatPct(stats.aproveitamentoPct) : "—";

  const lastTitle = formatSimuladoNumber(lastSession ? sessionNumberById.get(lastSession.id) : null);
  const lastTotal = safeNum(lastSession?.totalQuestions);
  const lastAnsweredRaw = safeNum(lastSession?.answeredCount);
  const lastAnswered = lastTotal > 0 ? Math.min(lastAnsweredRaw, lastTotal) : lastAnsweredRaw;
  const lastCorrect = safeNum(lastSession?.correctCount);
  const lastStatus = lastSession?.status ?? "in_progress";

  const lastScore =
    lastStatus === "completed"
      ? formatPct(safeNum(lastSession?.scorePercent, 0))
      : lastTotal > 0
      ? formatPct((lastAnswered / lastTotal) * 100)
      : "—";

  const recommendation = needsFocus
    ? `Foque em ${needsFocus.theme}: ${needsFocus.accuracy.toFixed(0)}% de acerto em ${needsFocus.total} questões.`
    : "Complete mais simulados para liberar recomendações por tema.";
  const recommendationHref = needsFocus
    ? `/aluno/simulados/novo?tema=${encodeURIComponent(needsFocus.theme)}&qtd=15`
    : "/aluno/simulados/novo?qtd=10";
  const lastStudyLabel = formatRelativeStudyTime(tsToMs(lastSession?.updatedAt || lastSession?.createdAt));

  const accuracyColor =
    stats.aproveitamentoPct >= 70
      ? "text-emerald-600 dark:text-emerald-400"
      : stats.aproveitamentoPct >= 50
      ? "text-amber-600 dark:text-amber-400"
      : "text-rose-600 dark:text-rose-400";

  // Saudação por horário
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const firstName =
    firestoreName ||
    (auth.currentUser?.displayName || "").trim().split(" ")[0] ||
    "";
  const todayLabel = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

  // Trend icon
  const TrendIcon = trendLabel.startsWith("Subiu")
    ? TrendingUp
    : trendLabel.startsWith("Caiu")
    ? TrendingDown
    : Minus;
  const trendColor = trendLabel.startsWith("Subiu")
    ? "text-emerald-600 dark:text-emerald-400"
    : trendLabel.startsWith("Caiu")
    ? "text-rose-500 dark:text-rose-400"
    : "text-slate-500 dark:text-slate-400";

  return (
    <div className="space-y-6 overflow-x-hidden">

      {/* GREETING */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-500 capitalize">{todayLabel}</div>
          <div className="mt-0.5 text-2xl font-black text-slate-900 dark:text-slate-100">
            {firstName ? `${greeting}, ${firstName}! 👋` : `${greeting}! 👋`}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <span>{lastStudyLabel}</span>
            {streakCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-xs font-bold text-orange-600 dark:border-orange-900/40 dark:bg-orange-950/30 dark:text-orange-400">
                <Flame size={12} />
                {streakCount} {streakCount === 1 ? "dia" : "dias"} seguidos
              </span>
            )}
          </div>
        </div>
        <Button className="mt-3 w-full gap-2 sm:mt-0 sm:w-auto" onClick={() => router.push(inProgressSession ? `/aluno/simulados/${inProgressSession.id}` : "/aluno/simulados/novo")}>
          <Zap size={14} />
          {inProgressSession ? "Continuar simulado" : "Novo simulado"}
        </Button>
      </div>

      {/* ESTUDO DE HOJE — CTA principal */}
      <button
        type="button"
        onClick={() => router.push("/aluno/estudo-de-hoje")}
        className="flex w-full items-center justify-between gap-4 rounded-2xl border border-indigo-200/80 bg-gradient-to-r from-indigo-600 to-blue-600 p-5 text-left shadow-[0_10px_40px_rgba(99,102,241,0.3)] transition hover:shadow-[0_14px_50px_rgba(99,102,241,0.4)] dark:border-indigo-700/50"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-white">
            <Sparkles size={22} />
          </div>
          <div>
            <div className="text-lg font-black text-white">Estudo de hoje</div>
            <div className="mt-0.5 text-sm text-indigo-100">
              {todayProgress.questions > 0 || todayProgress.flashcards > 0
                ? `${todayProgress.questions} questões · ${todayProgress.flashcards} flashcards feitos`
                : "Veja seu plano diário personalizado"}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 text-sm font-bold text-white">
          Ver plano <ChevronRight size={16} />
        </div>
      </button>

      {/* PROGRESSO DO DIA */}
      {(todayProgress.questions > 0 || todayProgress.flashcards > 0 || dailyGoals.questionsGoal > 0) && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800/80 dark:bg-slate-900/50">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-500">
              Progresso de hoje
            </div>
            <button
              onClick={() => router.push("/aluno/configuracoes")}
              className="text-xs font-semibold text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-200"
            >
              Editar metas →
            </button>
          </div>
          <div className="space-y-3">
            <ProgressBar
              label="Questões"
              value={todayProgress.questions}
              goal={dailyGoals.questionsGoal}
              color="indigo"
            />
            <ProgressBar
              label="Flashcards"
              value={todayProgress.flashcards}
              goal={dailyGoals.flashcardsGoal}
              color="blue"
            />
          </div>
        </div>
      )}

      {/* MÉTRICAS HEROICAS */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 dark:border-slate-800/80 dark:bg-slate-900/50">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-500">Aproveitamento</div>
          <div className={cn("mt-1 text-3xl font-black", accuracyColor)}>
            {aproveitamentoLabel}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-500">geral</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 dark:border-slate-800/80 dark:bg-slate-900/50">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-500">Questões</div>
          <div className="mt-1 text-3xl font-black text-slate-900 dark:text-slate-100">
            {resolvidasLabel}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-500">respondidas</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 dark:border-slate-800/80 dark:bg-slate-900/50">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-500">Simulados</div>
          <div className="mt-1 text-3xl font-black text-slate-900 dark:text-slate-100">
            {stats.concluidos > 0 ? String(stats.concluidos) : "—"}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-500">concluídos</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 dark:border-slate-800/80 dark:bg-slate-900/50">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-500">Acertos</div>
          <div className="mt-1 text-3xl font-black text-slate-900 dark:text-slate-100">
            {stats.acertos > 0 ? String(stats.acertos) : "—"}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-500">no total</div>
        </div>
      </div>

      {/* QUESTÃO DO DIA */}
      <button
        type="button"
        onClick={() => router.push("/aluno/questao-do-dia")}
        className="flex w-full items-center justify-between gap-4 rounded-2xl border border-amber-200/70 bg-gradient-to-br from-amber-50 to-orange-50 p-5 text-left transition hover:border-amber-300 dark:border-amber-900/40 dark:from-amber-950/20 dark:to-orange-950/10 dark:hover:border-amber-700"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-[0_10px_25px_rgba(245,158,11,0.35)]">
            <CalendarDays size={20} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-lg font-black text-slate-900 dark:text-slate-100">Questão do dia</div>
              {daily?.answered && (
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                  Feita ✓
                </span>
              )}
            </div>
            <div className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
              {daily?.answered
                ? "Você já respondeu hoje. Volte amanhã para uma nova!"
                : "Teste seus conhecimentos com a questão de hoje."}
            </div>
          </div>
        </div>
        <span className="hidden shrink-0 items-center gap-1 text-sm font-semibold text-amber-700 sm:inline-flex dark:text-amber-400">
          {daily?.answered ? "Ver" : "Responder"} <ChevronRight size={16} />
        </span>
      </button>

      {/* FLASHCARDS */}
      <button
        type="button"
        onClick={() => router.push("/aluno/flashcards")}
        className="flex w-full flex-col gap-4 rounded-2xl border border-indigo-200/70 bg-gradient-to-br from-indigo-50 to-blue-50 p-5 text-left transition hover:border-indigo-300 sm:flex-row sm:items-center sm:justify-between dark:border-indigo-900/40 dark:from-indigo-950/30 dark:to-blue-950/20 dark:hover:border-indigo-700"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-500 text-white shadow-[0_10px_25px_rgba(99,102,241,0.35)]">
            <Layers size={20} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-lg font-black text-slate-900 dark:text-slate-100">Flashcards</div>
              <span className="rounded-full bg-gradient-to-r from-indigo-500 to-blue-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                Novo
              </span>
            </div>
            <div className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
              {flashcardStats.studied > 0 ? (
                <span>
                  {flashcardStats.due > 0 && (
                    <b className="text-indigo-700 dark:text-indigo-300">{flashcardStats.due} para revisar hoje</b>
                  )}
                  {flashcardStats.due > 0 ? " · " : ""}
                  {flashcardStats.studied} estudados · {flashcardStats.mastered} dominados
                </span>
              ) : (
                "Revisão espaçada com as questões do banco — memorize mais, em menos tempo."
              )}
            </div>
          </div>
        </div>
        <span className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white sm:w-auto dark:bg-gradient-to-r dark:from-blue-500 dark:to-indigo-500">
          <Zap size={14} />
          {flashcardStats.due > 0
            ? `Revisar ${flashcardStats.due}`
            : flashcardStats.studied > 0
            ? "Continuar"
            : "Conhecer"}
        </span>
      </button>

      {/* RESUMO PERÍODO + RECOMENDAÇÃO */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-500">{activeWindowLabel}</div>
                <div className="mt-0.5 text-lg font-black text-slate-900 dark:text-slate-100">Resumo</div>
              </div>
              <div className="flex items-center gap-2">
                {resumeWindow === "7d" && (
                  <div className={cn("flex items-center gap-1 text-xs font-semibold", trendColor)}>
                    <TrendIcon size={14} />
                    <span className="hidden sm:inline">{trendLabel}</span>
                  </div>
                )}
                {/* Toggle 7d / 30d */}
                <div className="flex rounded-xl border border-slate-200 p-0.5 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => setResumeWindow("7d")}
                    className={cn(
                      "rounded-lg px-2.5 py-1 text-[11px] font-bold transition",
                      resumeWindow === "7d"
                        ? "bg-slate-900 text-white dark:bg-blue-500"
                        : "text-slate-500 hover:text-slate-700 dark:text-slate-400"
                    )}
                  >
                    7d
                  </button>
                  <button
                    type="button"
                    onClick={() => setResumeWindow("30d")}
                    className={cn(
                      "rounded-lg px-2.5 py-1 text-[11px] font-bold transition",
                      resumeWindow === "30d"
                        ? "bg-slate-900 text-white dark:bg-blue-500"
                        : "text-slate-500 hover:text-slate-700 dark:text-slate-400"
                    )}
                  >
                    30d
                  </button>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-2xl border bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Respondidas</div>
                <div className="mt-1 text-2xl font-black text-slate-900 dark:text-slate-100">{activeWindowStats.answered || "—"}</div>
              </div>
              <div className="rounded-2xl border bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Acerto</div>
                <div className={cn("mt-1 text-2xl font-black",
                  activeWindowStats.accuracy >= 70 ? "text-emerald-600 dark:text-emerald-400" :
                  activeWindowStats.accuracy >= 50 ? "text-amber-600 dark:text-amber-400" :
                  activeWindowStats.answered > 0 ? "text-rose-500 dark:text-rose-400" : "text-slate-900 dark:text-slate-100"
                )}>
                  {activeWindowStats.answered > 0 ? formatPct(activeWindowStats.accuracy) : "—"}
                </div>
              </div>
              <div className="rounded-2xl border bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Concluídos</div>
                <div className="mt-1 text-2xl font-black text-slate-900 dark:text-slate-100">{activeWindowStats.completed || "—"}</div>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-500">Recomendação</div>
            <div className="mt-0.5 text-lg font-black text-slate-900 dark:text-slate-100">
              {themeInsights.weakest ? `Reforçar: ${themeInsights.weakest.theme}` : needsFocus ? `Reforçar: ${needsFocus.theme}` : "Simulado rápido"}
            </div>
          </CardHeader>
          <CardBody className="space-y-3">
            {/* Insight de queda recente */}
            {themeInsights.falling && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                <span>
                  <b>{themeInsights.falling.theme}</b> caiu{" "}
                  {Math.round(themeInsights.falling.allTimeAcc - themeInsights.falling.recentAcc)} p.p. esta semana
                  ({formatPct(themeInsights.falling.recentAcc)} vs {formatPct(themeInsights.falling.allTimeAcc)} geral).
                </span>
              </div>
            )}
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {themeInsights.weakest
                ? `Acerto de ${formatPct(themeInsights.weakest.acc)} em ${themeInsights.weakest.theme} (${themeInsights.weakest.total} questões). Pratique mais esse tema para subir sua média.`
                : recommendation}
            </p>
            <div className="flex gap-2">
              <Button
                className="flex-1 gap-1.5"
                onClick={() => router.push(
                  themeInsights.weakest
                    ? `/aluno/simulados/novo?tema=${encodeURIComponent(themeInsights.weakest.theme)}&qtd=15`
                    : recommendationHref
                )}
              >
                <BookOpen size={14} />
                {themeInsights.weakest ? "Treinar tema" : needsFocus ? "Treinar tema" : "Iniciar"}
              </Button>
              <Button className="flex-1" variant="secondary" onClick={() => router.push("/aluno/simulados/novo?qtd=10")}>
                Sprint 10
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* CADERNO DE ERROS — atalho rápido se houver pendentes */}
      {errorNotebookCount > 0 && (
        <button
          type="button"
          onClick={() => router.push("/aluno/caderno")}
          className="flex w-full items-center justify-between gap-4 rounded-2xl border border-rose-200/70 bg-gradient-to-br from-rose-50 to-orange-50 p-5 text-left transition hover:border-rose-300 dark:border-rose-900/40 dark:from-rose-950/20 dark:to-orange-950/10 dark:hover:border-rose-700"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-orange-500 text-white shadow-[0_10px_25px_rgba(244,63,94,0.3)]">
              <NotebookPen size={20} />
            </div>
            <div>
              <div className="text-lg font-black text-slate-900 dark:text-slate-100">Caderno de Erros</div>
              <div className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
                <b className="text-rose-600 dark:text-rose-400">{errorNotebookCount}</b>{" "}
                questão{errorNotebookCount !== 1 ? "s" : ""} pendente{errorNotebookCount !== 1 ? "s" : ""} para revisar
              </div>
            </div>
          </div>
          <span className="hidden shrink-0 items-center gap-1 text-sm font-semibold text-rose-600 sm:inline-flex dark:text-rose-400">
            Revisar <ChevronRight size={16} />
          </span>
        </button>
      )}

      {/* Último simulado */}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Último simulado</div>
              <button
                type="button"
                onClick={() => void load()}
                className="text-xs font-semibold text-slate-500 transition hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              >
                Atualizar
              </button>
            </div>
            <div className="mt-1 text-xl font-black text-slate-900 truncate dark:text-slate-100">{lastTitle}</div>

            {lastSession ? (
              <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                Status:{" "}
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {lastStatus === "completed" ? "Concluído" : "Em andamento"}
                </span>{" "}
                • Respondidas:{" "}
                <span className="font-semibold text-slate-900 dark:text-slate-100">{lastAnswered}</span>
                {lastTotal ? (
                  <>
                    {" "}
                    / <span className="font-semibold text-slate-900 dark:text-slate-100">{lastTotal}</span>
                  </>
                ) : null}
                <>
                  {" "}
                  • Acertos: <span className="font-semibold text-slate-900 dark:text-slate-100">{lastCorrect}</span>
                </>
              </div>
            ) : (
              <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                Você ainda não iniciou nenhum simulado.
              </div>
            )}
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
            <div className="rounded-2xl border bg-slate-50 px-4 py-3 sm:min-w-[150px] dark:border-slate-700 dark:bg-slate-800">
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {lastStatus === "completed" ? "Nota" : "Progresso"}
              </div>
              <div className="mt-1 text-2xl font-black text-slate-900 dark:text-slate-100">{lastScore}</div>
            </div>

            {lastSession ? (
              <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-2">
                {lastStatus !== "completed" ? (
                  <Button className="w-full" onClick={() => router.push(`/aluno/simulados/${lastSession.id}`)}>
                    Continuar
                  </Button>
                ) : (
                  <Button className="w-full" onClick={() => router.push(`/aluno/simulados/${lastSession.id}/resultado`)}>
                    Ver resultado
                  </Button>
                )}

                <Button className="w-full" variant="secondary" onClick={() => router.push("/aluno/simulados")}>
                  Ver todos
                </Button>
              </div>
            ) : (
              <Button className="w-full sm:w-auto" onClick={() => router.push("/aluno/simulados")}>
                Ir para simulados
              </Button>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* GRÁFICO DE EVOLUÇÃO */}
      <Card>
        <CardHeader>
          <div className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-500">Evolução</div>
          <div className="mt-0.5 text-lg font-black text-slate-900 dark:text-slate-100">Desempenho nos últimos simulados</div>
        </CardHeader>
        <CardBody>
          {performanceSeries.length < 2 ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="text-sm text-slate-500 dark:text-slate-400">
                Complete mais simulados para visualizar seu gráfico de evolução.
              </div>
              <Button variant="secondary" onClick={() => router.push("/aluno/simulados/novo")}>
                Criar simulado
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <svg viewBox="0 0 520 210" className="h-52 min-w-[400px] w-full">
                <defs>
                  <linearGradient id="aqAreaGrad" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity="0.01" />
                  </linearGradient>
                  <linearGradient id="aqLineGrad" x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#3b82f6" />
                  </linearGradient>
                </defs>

                {/* Grid lines */}
                {[0, 25, 50, 75, 100].map((tick) => {
                  const y = 20 + (100 - tick) * 1.5;
                  return (
                    <g key={tick}>
                      <line x1="38" x2="510" y1={y} y2={y} stroke="currentColor"
                        className="text-slate-200 dark:text-slate-700/60"
                        strokeDasharray={tick === 70 ? "0" : "3 4"}
                        strokeWidth={tick === 70 ? 0 : 1} />
                      <text x="32" y={y + 4} textAnchor="end" fontSize="10"
                        className="fill-slate-400 dark:fill-slate-600">{tick}%</text>
                    </g>
                  );
                })}

                {/* Linha de meta 70% */}
                {(() => {
                  const goalY = 20 + (100 - 70) * 1.5;
                  return (
                    <g>
                      <line x1="38" x2="510" y1={goalY} y2={goalY}
                        stroke="#22c55e" strokeWidth="1.5" strokeDasharray="6 4" opacity="0.7" />
                      <text x="512" y={goalY + 4} textAnchor="start" fontSize="9" fontWeight="700"
                        fill="#22c55e" opacity="0.8">Meta</text>
                    </g>
                  );
                })()}

                {/* Área preenchida */}
                <path
                  fill="url(#aqAreaGrad)"
                  d={[
                    performanceSeries.map((item, i) => {
                      const step = performanceSeries.length > 1 ? 472 / (performanceSeries.length - 1) : 0;
                      const x = 38 + i * step;
                      const y = 20 + (100 - item.value) * 1.5;
                      return i === 0 ? `M ${x},${y}` : `L ${x},${y}`;
                    }).join(" "),
                    `L ${38 + (performanceSeries.length - 1) * (472 / Math.max(1, performanceSeries.length - 1))},170`,
                    `L 38,170 Z`
                  ].join(" ")}
                />

                {/* Linha */}
                <polyline
                  fill="none"
                  stroke="url(#aqLineGrad)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={performanceSeries.map((item, i) => {
                    const step = performanceSeries.length > 1 ? 472 / (performanceSeries.length - 1) : 0;
                    const x = 38 + i * step;
                    const y = 20 + (100 - item.value) * 1.5;
                    return `${x},${y}`;
                  }).join(" ")}
                />

                {/* Pontos + labels */}
                {performanceSeries.map((item, i) => {
                  const step = performanceSeries.length > 1 ? 472 / (performanceSeries.length - 1) : 0;
                  const x = 38 + i * step;
                  const y = 20 + (100 - item.value) * 1.5;
                  const isLast = i === performanceSeries.length - 1;
                  const dotColor = item.value >= 70 ? "#22c55e" : item.value >= 50 ? "#f59e0b" : "#ef4444";
                  const labelColor = item.value >= 70 ? "#16a34a" : item.value >= 50 ? "#d97706" : "#dc2626";
                  // Stagger labels: even above, odd below (to avoid overlap on dense charts)
                  const labelOffset = performanceSeries.length > 4 ? (i % 2 === 0 ? -11 : 18) : -11;
                  return (
                    <g key={item.id}>
                      {isLast && (
                        <circle cx={x} cy={y} r={9} fill={dotColor} opacity="0.18" />
                      )}
                      <circle cx={x} cy={y} r={isLast ? 5.5 : 4.5}
                        fill={dotColor} stroke="white" strokeWidth="2"
                        className="dark:stroke-slate-900" />
                      <text x={x} y={y + labelOffset} textAnchor="middle" fontSize="9.5" fontWeight="700"
                        fill={labelColor}>{Math.round(item.value)}%</text>
                      <text x={x} y="194" textAnchor="middle" fontSize="10"
                        className="fill-slate-400 dark:fill-slate-500">{item.label}</text>
                    </g>
                  );
                })}
              </svg>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Diagnóstico por tema — usa stats agregadas (mais precisas) quando disponíveis */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Tema para focar</div>
            <div className="mt-1 text-lg font-black text-slate-900 dark:text-slate-100">
              {themeInsights.weakest?.theme ?? needsFocus?.theme ?? "Sem dados suficientes"}
            </div>
          </CardHeader>
          <CardBody className="space-y-3">
            {themeInsights.weakest ? (
              <>
                <div className="text-sm text-slate-700 dark:text-slate-300">
                  Seu ponto mais fraco com amostra confiável. Praticar este tema é o que mais impacta sua média.
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-2xl border bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Acerto</div>
                    <div className={cn("mt-1 text-2xl font-black",
                      themeInsights.weakest.acc >= 70 ? "text-emerald-600 dark:text-emerald-400" :
                      themeInsights.weakest.acc >= 50 ? "text-amber-600 dark:text-amber-400" : "text-rose-500 dark:text-rose-400"
                    )}>
                      {formatPct(themeInsights.weakest.acc)}
                    </div>
                  </div>
                  <div className="rounded-2xl border bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Questões</div>
                    <div className="mt-1 text-2xl font-black text-slate-900 dark:text-slate-100">{themeInsights.weakest.total}</div>
                  </div>
                </div>
                <Button
                  className="w-full gap-1.5"
                  onClick={() => router.push(`/aluno/simulados/novo?tema=${encodeURIComponent(themeInsights.weakest!.theme)}&qtd=15`)}
                >
                  <BookOpen size={14} /> Treinar agora
                </Button>
              </>
            ) : needsFocus ? (
              <>
                <div className="text-sm text-slate-700 dark:text-slate-300">{recommendation}</div>
                <div className="rounded-2xl border bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Taxa de acerto</div>
                  <div className="mt-1 text-2xl font-black text-slate-900 dark:text-slate-100">{formatPct(needsFocus.accuracy)}</div>
                </div>
              </>
            ) : (
              <div className="text-sm text-slate-700 dark:text-slate-300">
                Complete mais simulados para liberar o diagnóstico por tema.
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Seu melhor tema</div>
            <div className="mt-1 text-lg font-black text-slate-900 dark:text-slate-100">
              {themeInsights.strongest?.theme ?? bestTheme?.theme ?? "Sem dados suficientes"}
            </div>
          </CardHeader>
          <CardBody className="space-y-3">
            {themeInsights.strongest ? (
              <>
                <div className="text-sm text-slate-700 dark:text-slate-300">
                  Continue estudando para manter a consistência nesse tema.
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-2xl border bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Acerto</div>
                    <div className="mt-1 text-2xl font-black text-emerald-600 dark:text-emerald-400">
                      {formatPct(themeInsights.strongest.acc)}
                    </div>
                  </div>
                  <div className="rounded-2xl border bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Questões</div>
                    <div className="mt-1 text-2xl font-black text-slate-900 dark:text-slate-100">{themeInsights.strongest.total}</div>
                  </div>
                </div>
              </>
            ) : bestTheme ? (
              <>
                <div className="text-sm text-slate-700 dark:text-slate-300">
                  Continue para manter consistência nesse tema.
                </div>
                <div className="rounded-2xl border bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Acerto médio</div>
                  <div className="mt-1 text-2xl font-black text-slate-900 dark:text-slate-100">{formatPct(bestTheme.accuracy)}</div>
                </div>
              </>
            ) : (
              <div className="text-sm text-slate-700 dark:text-slate-300">
                Responda mais questões para visualizar seu melhor desempenho por tema.
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {themePerformance.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="text-sm font-semibold text-slate-500 dark:text-slate-400">Temas com melhor desempenho</div>
            </CardHeader>
            <CardBody className="space-y-3">
              {topThemes.map((t) => (
                <div key={`top-${t.theme}`} className="rounded-2xl border bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{t.theme}</div>
                    <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400">{formatPct(t.accuracy)}</div>
                  </div>
                  <div className="mt-2 h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, Math.max(0, t.accuracy))}%` }} />
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <div className="text-sm font-semibold text-slate-500 dark:text-slate-400">Temas para reforçar</div>
            </CardHeader>
            <CardBody className="space-y-3">
              {weakThemes.map((t) => (
                <div key={`weak-${t.theme}`} className="rounded-2xl border bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{t.theme}</div>
                    <div className="text-xs font-bold text-amber-700 dark:text-amber-400">{formatPct(t.accuracy)}</div>
                  </div>
                  <div className="mt-2 h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.min(100, Math.max(0, t.accuracy))}%` }} />
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      ) : null}

      {/* SIMULADOS RECENTES — lista compacta */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-500">Recentes</div>
              <div className="mt-0.5 text-lg font-black text-slate-900 dark:text-slate-100">Últimos simulados</div>
            </div>
            <button
              onClick={() => router.push("/aluno/simulados")}
              className="flex items-center gap-1 text-xs font-semibold text-slate-500 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            >
              Ver todos <ChevronRight size={13} />
            </button>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {recentTop3.length === 0 ? (
            <div className="px-5 pb-5 text-sm text-slate-500 dark:text-slate-400">
              Você ainda não iniciou nenhum simulado.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {recentTop3.map((s) => {
                const title = formatSimuladoNumber(sessionNumberById.get(s.id));
                const total = safeNum(s.totalQuestions);
                const answeredRaw = safeNum(s.answeredCount);
                const answered = total > 0 ? Math.min(answeredRaw, total) : answeredRaw;
                const correct = safeNum(s.correctCount);
                const status = s.status ?? "in_progress";
                const isCompleted = status === "completed";
                const pct = isCompleted
                  ? safeNum(s.scorePercent, 0)
                  : total > 0 ? (answered / total) * 100 : 0;
                const pctColor = pct >= 70 ? "text-emerald-600 dark:text-emerald-400"
                  : pct >= 50 ? "text-amber-600 dark:text-amber-400"
                  : answered > 0 ? "text-rose-500 dark:text-rose-400"
                  : "text-slate-400 dark:text-slate-600";

                return (
                  <div key={s.id} className="flex items-center gap-4 px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-slate-900 dark:text-slate-100 text-sm">{title}</span>
                        <span className={cn(
                          "rounded-full border px-2 py-0.5 text-[10px] font-bold",
                          isCompleted
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300"
                            : "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900/40 dark:bg-indigo-950/30 dark:text-indigo-300"
                        )}>
                          {isCompleted ? "Concluído" : "Andamento"}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {answered}/{total || "—"} respondidas · {correct} acertos
                      </div>
                      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div className={cn("h-full rounded-full", isCompleted ? "bg-emerald-500" : "bg-indigo-500")}
                          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className={cn("text-xl font-black", pctColor)}>{answered > 0 ? formatPct(pct) : "—"}</div>
                      <button
                        onClick={() => router.push(isCompleted ? `/aluno/simulados/${s.id}/resultado` : `/aluno/simulados/${s.id}`)}
                        className="mt-1 text-xs font-semibold text-slate-500 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                      >
                        {isCompleted ? "Resultado →" : "Continuar →"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
