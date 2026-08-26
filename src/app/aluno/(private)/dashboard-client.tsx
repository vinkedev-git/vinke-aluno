"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { collection, doc, getDoc, getDocs, limit, orderBy, query } from "firebase/firestore";
import { Flame } from "lucide-react";
import { getDailyStatus } from "@/lib/daily";
import { getFlashcardOverview } from "@/lib/flashcards/stats";
import { VinkeSymbol } from "@/components/VinkeLogo";

// ─── Tipos ───────────────────────────────────────────────────────────────────

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
  titleDisplay?: string;
  questionIds?: unknown;
  answersMap?: Record<string, { isCorrect?: boolean }>;
  filters?: {
    temas?: string[];
  };
  control?: boolean;
  kind?: string;
};

type QuestionMetaDoc = {
  themes?: unknown;
  assuntos?: unknown;
  temas?: unknown;
  tema?: unknown;
  areaId?: unknown;
  area?: unknown;
};

type ThemePerformance = {
  theme: string;
  total: number;
  correct: number;
  wrong: number;
  accuracy: number;
};

type AreaPerformance = {
  areaId: string;
  nome: string;
  total: number;
  correct: number;
  accuracy: number;
};

type DashboardCache = {
  ts: number;
  sessions: SessionDoc[];
  themePerformance: ThemePerformance[];
  areaPerformance: AreaPerformance[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

function normalizeQuestionIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object" && "id" in item) {
        return String((item as { id?: unknown }).id ?? "").trim();
      }
      return "";
    })
    .filter(Boolean);
}

function extractQuestionThemes(question: QuestionMetaDoc): string[] {
  const list = [
    ...toStringList(question.assuntos),
    ...toStringList(question.themes),
    ...toStringList(question.temas),
  ];
  const single = String(question.tema ?? "").trim();
  if (single) list.push(single);
  return Array.from(new Set(list));
}

function safeNum(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function tsToMs(v: unknown): number {
  if (!v) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "object" && v !== null) {
    const t = v as { toMillis?: () => number; seconds?: number };
    if (typeof t.toMillis === "function") return t.toMillis();
    if (typeof t.seconds === "number") return t.seconds * 1000;
  }
  return 0;
}

const AREA_ORDER = ["area-linguagens", "area-humanas", "area-natureza", "area-matematica"];
const AREA_SHORT: Record<string, string> = {
  "area-linguagens": "Linguagens",
  "area-humanas": "Ciências Humanas",
  "area-natureza": "Ciências da Natureza",
  "area-matematica": "Matemática",
};

const DASHBOARD_CACHE_TTL_MS = 60_000;
const DASHBOARD_CACHE_KEY = "vinke.aluno.dashboard.cache.v2";

function readDashboardCache(uid: string): DashboardCache | null {
  try {
    const raw = localStorage.getItem(`${DASHBOARD_CACHE_KEY}.${uid}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DashboardCache;
    if (!parsed?.ts || Date.now() - parsed.ts > DASHBOARD_CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeDashboardCache(uid: string, value: DashboardCache) {
  try {
    localStorage.setItem(`${DASHBOARD_CACHE_KEY}.${uid}`, JSON.stringify(value));
  } catch {
    /* storage cheio/indisponível não é crítico */
  }
}

// ─── Desempenho por assunto e por área ───────────────────────────────────────

async function buildPerformance(
  items: SessionDoc[]
): Promise<{ themes: ThemePerformance[]; areas: AreaPerformance[] }> {
  const byTheme = new Map<string, { correct: number; wrong: number; total: number }>();
  const byArea = new Map<string, { nome: string; correct: number; total: number }>();
  const completed = items.filter((s) => s.status === "completed").slice(0, 8);

  const questionToSessionThemes = new Map<string, string[]>();
  const qidSet = new Set<string>();

  for (const session of completed) {
    const qids = normalizeQuestionIds(session.questionIds);
    const fallbackThemes = toStringList(session.filters?.temas);
    for (const qid of qids) {
      if (!qid) continue;
      qidSet.add(qid);
      if (fallbackThemes.length) questionToSessionThemes.set(qid, fallbackThemes);
    }
  }

  const allQids = Array.from(qidSet).slice(0, 150);
  const docs = await Promise.all(
    allQids.map(async (qid) => {
      try {
        const qSnap = await getDoc(doc(db, "questionsBank", qid));
        if (!qSnap.exists()) {
          return [qid, { themes: [] as string[], areaId: "", areaNome: "" }] as const;
        }
        const data = qSnap.data() as QuestionMetaDoc;
        return [
          qid,
          {
            themes: extractQuestionThemes(data),
            areaId: String(data.areaId ?? "").trim(),
            areaNome: String(data.area ?? "").trim(),
          },
        ] as const;
      } catch {
        return [qid, { themes: [] as string[], areaId: "", areaNome: "" }] as const;
      }
    })
  );

  const metaCache = new Map(docs);

  for (const session of completed) {
    const qids = normalizeQuestionIds(session.questionIds);
    const fallbackThemes = toStringList(session.filters?.temas);

    for (const qid of qids) {
      const answer = session.answersMap?.[qid];
      if (!answer) continue;

      const meta = metaCache.get(qid);
      const themes =
        meta && meta.themes.length > 0
          ? meta.themes
          : questionToSessionThemes.get(qid) ?? fallbackThemes;

      for (const theme of themes) {
        const current = byTheme.get(theme) ?? { correct: 0, wrong: 0, total: 0 };
        current.total += 1;
        if (answer.isCorrect) current.correct += 1;
        else current.wrong += 1;
        byTheme.set(theme, current);
      }

      if (meta?.areaId) {
        const current = byArea.get(meta.areaId) ?? {
          nome: AREA_SHORT[meta.areaId] ?? meta.areaNome ?? meta.areaId,
          correct: 0,
          total: 0,
        };
        current.total += 1;
        if (answer.isCorrect) current.correct += 1;
        byArea.set(meta.areaId, current);
      }
    }
  }

  const themes = Array.from(byTheme.entries())
    .map(([theme, agg]) => ({
      theme,
      total: agg.total,
      correct: agg.correct,
      wrong: agg.wrong,
      accuracy: agg.total > 0 ? (agg.correct / agg.total) * 100 : 0,
    }))
    .sort((a, b) => (b.total !== a.total ? b.total - a.total : b.accuracy - a.accuracy));

  const areas = AREA_ORDER.filter((id) => byArea.has(id))
    .map((id) => {
      const agg = byArea.get(id)!;
      return {
        areaId: id,
        nome: agg.nome,
        total: agg.total,
        correct: agg.correct,
        accuracy: agg.total > 0 ? (agg.correct / agg.total) * 100 : 0,
      };
    });

  return { themes, areas };
}

// ─── Componente ──────────────────────────────────────────────────────────────

export default function DashboardClient() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [sessions, setSessions] = useState<SessionDoc[]>([]);
  const [themePerformance, setThemePerformance] = useState<ThemePerformance[]>([]);
  const [areaPerformance, setAreaPerformance] = useState<AreaPerformance[]>([]);
  const [firestoreName, setFirestoreName] = useState("");
  const [flashcardStats, setFlashcardStats] = useState({ studied: 0, due: 0, mastered: 0 });
  const [streakCount, setStreakCount] = useState(0);
  const [daily, setDaily] = useState<{ exists: boolean; answered: boolean } | null>(null);
  const [todayProgress, setTodayProgress] = useState({ questions: 0, flashcards: 0 });
  const [dailyGoals, setDailyGoals] = useState({ questionsGoal: 20, flashcardsGoal: 10 });
  const [errorNotebookCount, setErrorNotebookCount] = useState(0);
  const [targetExam, setTargetExam] = useState("");
  const [targetExamDate, setTargetExamDate] = useState("");

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

      const [snap, userSnap, fcOverview, statsSnap, settingsSnap, dailyStatus, errorSnap] =
        await Promise.all([
          getDocs(qy),
          getDoc(doc(db, "users", u.uid)),
          getFlashcardOverview(u.uid),
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
        };
        setStreakCount(Number(s.streakCount ?? 0));
        setTodayProgress({
          questions: Number(s.todayAnswered ?? 0),
          flashcards: Number(s.todayFlashcards ?? 0),
        });
      }

      setErrorNotebookCount(
        errorSnap.docs.filter((d) => {
          const data = d.data() as { status?: string };
          return (data.status ?? "pending") === "pending";
        }).length
      );

      if (settingsSnap.exists()) {
        const s = settingsSnap.data() as {
          dailyQuestionsGoal?: number;
          dailyFlashcardsGoal?: number;
          targetExam?: string;
          targetExamDate?: string;
        };
        setDailyGoals({
          questionsGoal: Number(s.dailyQuestionsGoal ?? 20),
          flashcardsGoal: Number(s.dailyFlashcardsGoal ?? 10),
        });
        setTargetExam(String(s.targetExam ?? ""));
        setTargetExamDate(String(s.targetExamDate ?? ""));
      }

      setDaily(dailyStatus ? { exists: dailyStatus.exists, answered: dailyStatus.answered } : null);
      setFlashcardStats({
        studied: fcOverview.studied,
        due: fcOverview.due,
        mastered: fcOverview.mastered,
      });

      const items: SessionDoc[] = snap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<SessionDoc, "id">),
      }));

      items.sort((a, b) => tsToMs(b.updatedAt) - tsToMs(a.updatedAt));
      setSessions(items);

      void buildPerformance(items)
        .then((perf) => {
          setThemePerformance(perf.themes);
          setAreaPerformance(perf.areas);
          writeDashboardCache(u.uid, {
            ts: Date.now(),
            sessions: items,
            themePerformance: perf.themes,
            areaPerformance: perf.areas,
          });
        })
        .catch((error) => {
          console.error("Falha ao calcular desempenho:", error);
        });
    } catch (error: unknown) {
      console.error(error);
      setErr(getErrorMessage(error, "Falha ao carregar seus dados."));
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
        setAreaPerformance(cached.areaPerformance ?? []);
        setLoading(false);
        void load({ keepVisible: true });
        return;
      }
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Derivados ──────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const respondidas = sessions.reduce((acc, s) => acc + safeNum(s.answeredCount), 0);
    const acertos = sessions.reduce((acc, s) => acc + safeNum(s.correctCount), 0);
    const concluidos = sessions.filter((s) => s.status === "completed").length;
    const aproveitamentoPct = respondidas > 0 ? (acertos / respondidas) * 100 : 0;
    return { respondidas, acertos, concluidos, aproveitamentoPct };
  }, [sessions]);

  const inProgressSession = useMemo(
    () => sessions.find((s) => s.status === "in_progress") ?? null,
    [sessions]
  );

  const delta30d = useMemo(() => {
    const now = Date.now();
    const d30 = 30 * 24 * 60 * 60 * 1000;
    const recent = sessions.filter((s) => now - tsToMs(s.updatedAt) <= d30);
    const older = sessions.filter((s) => {
      const age = now - tsToMs(s.updatedAt);
      return age > d30 && age <= 2 * d30;
    });
    const acc = (list: SessionDoc[]) => {
      const r = list.reduce((a, s) => a + safeNum(s.answeredCount), 0);
      const c = list.reduce((a, s) => a + safeNum(s.correctCount), 0);
      return r > 0 ? (c / r) * 100 : null;
    };
    const a = acc(recent);
    const b = acc(older);
    if (a == null || b == null) return null;
    return Math.round(a - b);
  }, [sessions]);

  const diasParaProva = useMemo(() => {
    if (!targetExamDate) return null;
    const target = new Date(`${targetExamDate}T12:00:00`);
    if (Number.isNaN(target.getTime())) return null;
    const diff = Math.ceil((target.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    return diff >= 0 ? diff : null;
  }, [targetExamDate]);

  const saudacao = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Bom dia";
    if (h < 18) return "Boa tarde";
    return "Boa noite";
  }, []);

  const hoje = useMemo(() => {
    const d = new Date();
    const dias = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
    const meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    return `${dias[d.getDay()]}, ${d.getDate()} de ${meses[d.getMonth()]}`;
  }, []);

  const dayPct = useMemo(() => {
    const parts: number[] = [];
    if (dailyGoals.questionsGoal > 0)
      parts.push(Math.min(1, todayProgress.questions / dailyGoals.questionsGoal));
    if (dailyGoals.flashcardsGoal > 0)
      parts.push(Math.min(1, todayProgress.flashcards / dailyGoals.flashcardsGoal));
    if (!parts.length) return 0;
    return Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 100);
  }, [todayProgress, dailyGoals]);

  const weakestArea = useMemo(() => {
    if (areaPerformance.length < 2) return null;
    return [...areaPerformance].sort((a, b) => a.accuracy - b.accuracy)[0];
  }, [areaPerformance]);

  const continueProgress = inProgressSession
    ? Math.round(
        (safeNum(inProgressSession.answeredCount) /
          Math.max(1, safeNum(inProgressSession.totalQuestions))) *
          100
      )
    : 0;

  // ── Estados de carregamento/erro/vazio ─────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col gap-3.5">
        <div className="h-7 w-56 animate-pulse rounded-lg bg-vinke-line2 dark:bg-vinke-navy-sel" />
        <div className="flex gap-3.5">
          <div className="h-[110px] flex-[1.4] animate-pulse rounded-2xl bg-vinke-line2 dark:bg-vinke-navy-sel" />
          <div className="h-[110px] flex-1 animate-pulse rounded-2xl bg-vinke-line2 dark:bg-vinke-navy-sel" />
          <div className="h-[110px] flex-1 animate-pulse rounded-2xl bg-vinke-line2 dark:bg-vinke-navy-sel" />
        </div>
        <div className="h-16 animate-pulse rounded-2xl bg-vinke-line2 dark:bg-vinke-navy-sel" />
        <div className="h-64 animate-pulse rounded-2xl bg-vinke-line2 dark:bg-vinke-navy-sel" />
      </div>
    );
  }

  if (err) {
    return (
      <div className="mx-auto mt-16 flex max-w-sm flex-col items-center gap-2 rounded-2xl border-[1.5px] border-vinke-line bg-white p-6 text-center dark:border-vinke-navy-line dark:bg-vinke-navy-card">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-vinke-red-soft font-display text-base font-bold text-vinke-red">!</span>
        <span className="font-display text-sm font-bold text-vinke-ink dark:text-white">Não conseguimos carregar</span>
        <span className="text-xs text-vinke-ink3">{err}</span>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-1 rounded-[8px] border-[1.5px] border-vinke-line px-4 py-2 text-xs font-bold text-vinke-ink dark:border-vinke-navy-line dark:text-slate-200"
        >
          Tentar de novo
        </button>
      </div>
    );
  }

  const nome = firestoreName || "aluno";

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <Header
          saudacao={saudacao}
          nome={nome}
          hoje={hoje}
          diasParaProva={diasParaProva}
          streakCount={streakCount}
        />
        <div className="mx-auto mt-8 flex max-w-md flex-col items-center gap-2.5 rounded-2xl border-[1.5px] border-dashed border-vinke-line bg-white p-8 text-center dark:border-vinke-navy-line dark:bg-vinke-navy-card">
          <VinkeSymbol size={30} className="opacity-30" />
          <span className="font-display text-lg font-bold text-vinke-ink dark:text-white">
            Boas-vindas, {nome}!
          </span>
          <span className="text-xs leading-relaxed text-vinke-ink3">
            Responda suas primeiras questões para o Vinke conhecer seu nível e começar a medir sua evolução.
          </span>
          <Link
            href="/aluno/simulados/novo?qtd=10"
            className="mt-1 rounded-[9px] bg-vinke px-5 py-2.5 text-xs font-bold text-white transition hover:bg-vinke-deep"
          >
            Começar com 10 questões
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      <Header
        saudacao={saudacao}
        nome={nome}
        hoje={hoje}
        diasParaProva={diasParaProva}
        streakCount={streakCount}
      />

      {/* Linha herói: desempenho · meta · hoje */}
      <div className="flex flex-col gap-3.5 lg:flex-row">
        <div className="flex flex-[1.4] flex-col gap-1 rounded-2xl bg-vinke-navy p-6">
          <span className="text-[10px] font-semibold tracking-[0.12em] text-vinke-ink3">
            TAXA DE ACERTO GERAL
          </span>
          <div className="flex flex-wrap items-baseline gap-2.5">
            <span className="font-display text-[52px] font-bold leading-none text-white [font-variant-numeric:tabular-nums]">
              {Math.round(stats.aproveitamentoPct)}%
            </span>
            {delta30d != null && delta30d !== 0 ? (
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-bold",
                  delta30d > 0
                    ? "bg-vinke-green-soft text-vinke-green-text"
                    : "bg-white/10 text-slate-300"
                )}
              >
                {delta30d > 0 ? `↑ +${delta30d} pts nos últimos 30 dias` : `↓ ${delta30d} pts nos últimos 30 dias`}
              </span>
            ) : null}
          </div>
          <span className="text-xs font-medium text-vinke-ink3">
            média de acertos em tudo que você respondeu
          </span>
        </div>

        <div className="flex flex-1 flex-col gap-1.5 rounded-2xl bg-white p-6 dark:border dark:border-vinke-navy-line dark:bg-vinke-navy-card">
          <span className="text-[10px] font-semibold tracking-[0.12em] text-vinke-ink3">SUA META</span>
          {targetExam ? (
            <>
              <div className="flex items-baseline gap-2">
                <span className="font-display text-3xl font-bold text-vinke-ink dark:text-white">
                  {targetExam}
                </span>
              </div>
              <span className="text-xs font-semibold text-vinke-ink2 dark:text-slate-300">
                {diasParaProva != null ? (
                  <>
                    Faltam <strong className="text-vinke-ink dark:text-white">{diasParaProva} dias</strong> — cada dia conta.
                  </>
                ) : (
                  "Defina a data da prova nas Configurações."
                )}
              </span>
            </>
          ) : (
            <>
              <span className="text-sm font-semibold text-vinke-ink2 dark:text-slate-300">
                Nenhuma prova alvo ainda.
              </span>
              <Link href="/aluno/configuracoes" className="text-xs font-bold text-vinke dark:text-vinke-lav">
                Definir minha meta →
              </Link>
            </>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-1.5 rounded-2xl bg-white p-6 dark:border dark:border-vinke-navy-line dark:bg-vinke-navy-card">
          <span className="text-[10px] font-semibold tracking-[0.12em] text-vinke-ink3">HOJE</span>
          <div className="flex items-center gap-3">
            <GoalRing pct={dayPct} />
            <div className="flex flex-col gap-0.5 text-[11px] font-semibold text-vinke-ink2 dark:text-slate-300">
              <span className={cn(todayProgress.questions >= dailyGoals.questionsGoal && "text-vinke-green-text dark:text-vinke-green")}>
                {todayProgress.questions >= dailyGoals.questionsGoal ? "✓ " : ""}
                {todayProgress.questions}/{dailyGoals.questionsGoal} questões
              </span>
              <span className={cn(todayProgress.flashcards >= dailyGoals.flashcardsGoal && "text-vinke-green-text dark:text-vinke-green")}>
                {todayProgress.flashcards >= dailyGoals.flashcardsGoal ? "✓ " : ""}
                {todayProgress.flashcards}/{dailyGoals.flashcardsGoal} flashcards
              </span>
              <Link href="/aluno/estudo-de-hoje" className="text-[11px] font-bold text-vinke dark:text-vinke-lav">
                Estudo de hoje →
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Continue de onde parou */}
      {inProgressSession ? (
        <div className="flex flex-col gap-3 rounded-2xl bg-vinke p-5 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex flex-1 flex-col gap-0.5">
            <span className="text-[10px] font-semibold tracking-[0.12em] text-[#C9BCF9]">
              CONTINUE DE ONDE PAROU
            </span>
            <span className="font-display text-lg font-bold text-white">
              {inProgressSession.titleDisplay || inProgressSession.title || "Simulado"} ·{" "}
              {safeNum(inProgressSession.answeredCount)} de {safeNum(inProgressSession.totalQuestions)} respondidas
            </span>
          </div>
          <div className="hidden h-2 w-40 rounded-full bg-white/20 sm:block">
            <div className="h-2 rounded-full bg-white" style={{ width: `${continueProgress}%` }} />
          </div>
          <Link
            href={`/aluno/simulados/${inProgressSession.id}`}
            className="rounded-[10px] bg-white px-5 py-3 text-center text-[13px] font-bold text-vinke transition hover:opacity-90"
          >
            Continuar →
          </Link>
        </div>
      ) : null}

      {/* Desempenho por área + coluna direita */}
      <div className="flex flex-col gap-3.5 lg:flex-row">
        <div className="flex flex-[1.5] flex-col gap-3 rounded-2xl bg-white p-6 dark:border dark:border-vinke-navy-line dark:bg-vinke-navy-card">
          <span className="font-display text-sm font-bold text-vinke-ink dark:text-white">
            Desempenho por área
          </span>
          {areaPerformance.length ? (
            <div className="flex flex-col gap-2.5">
              {areaPerformance.map((a) => (
                <div key={a.areaId} className="flex items-center gap-3">
                  <span className="w-[150px] shrink-0 text-xs font-semibold text-vinke-ink dark:text-slate-200">
                    {a.nome}
                  </span>
                  <div className="h-2 min-w-0 flex-1 rounded-full bg-vinke-line2 dark:bg-vinke-navy-sel">
                    <div
                      className="h-2 rounded-full bg-vinke"
                      style={{ width: `${Math.round(a.accuracy)}%` }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right font-display text-[13px] font-bold text-vinke-ink dark:text-white [font-variant-numeric:tabular-nums]">
                    {Math.round(a.accuracy)}%
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <span className="text-xs text-vinke-ink3">
              Conclua um simulado para ver seu desempenho em cada área do ENEM.
            </span>
          )}
          {weakestArea ? (
            <span className="text-[11px] font-medium text-vinke-ink3">
              {weakestArea.nome} é sua maior chance de subir:{" "}
              <Link
                href={`/aluno/simulados/novo`}
                className="font-bold text-vinke dark:text-vinke-lav"
              >
                praticar agora →
              </Link>
            </span>
          ) : null}
        </div>

        <div className="flex flex-1 flex-col gap-3.5">
          <div className="grid grid-cols-3 gap-3.5">
            <MiniStat label="QUESTÕES" value={stats.respondidas.toLocaleString("pt-BR")} hint="respondidas" />
            <MiniStat label="SIMULADOS" value={String(stats.concluidos)} hint="concluídos" />
            <MiniStat
              label="ERROS"
              value={String(errorNotebookCount)}
              hint="para refazer"
              href="/aluno/caderno"
            />
          </div>
          <div className="flex flex-1 flex-col gap-2 rounded-2xl border-[1.5px] border-vinke-line bg-white p-5 dark:border-vinke-navy-line dark:bg-vinke-navy-card">
            <div className="flex items-center justify-between">
              <span className="font-display text-[13px] font-bold text-vinke-ink dark:text-white">
                Questão do dia
              </span>
              {daily?.answered ? (
                <span className="rounded-full bg-vinke-green-soft px-2.5 py-0.5 text-[10px] font-bold text-vinke-green-text dark:bg-vinke-green/15 dark:text-vinke-green">
                  ✓ respondida
                </span>
              ) : null}
            </div>
            <span className="text-xs leading-relaxed text-vinke-ink2 dark:text-slate-300">
              {daily?.answered
                ? "Sequência mantida! Volte amanhã para a próxima."
                : streakCount > 0
                  ? `Responda e mantenha seus ${streakCount} dias de sequência.`
                  : "Uma questão por dia constrói sua sequência de estudo."}
            </span>
            {!daily?.answered ? (
              <Link
                href="/aluno/questao-do-dia"
                className="mt-auto self-end rounded-[9px] bg-vinke px-4 py-2 text-[11px] font-bold text-white transition hover:bg-vinke-deep"
              >
                Responder
              </Link>
            ) : null}
          </div>
          {flashcardStats.due > 0 ? (
            <Link
              href="/aluno/flashcards"
              className="flex items-center justify-between rounded-2xl bg-vinke-soft px-5 py-3.5 text-xs font-bold text-vinke transition hover:bg-vinke-ring dark:bg-vinke/15 dark:text-vinke-lav"
            >
              <span>{flashcardStats.due} flashcards para revisar hoje</span>
              <span>→</span>
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ─── Peças ───────────────────────────────────────────────────────────────────

function Header({
  saudacao,
  nome,
  hoje,
  diasParaProva,
  streakCount,
}: {
  saudacao: string;
  nome: string;
  hoje: string;
  diasParaProva: number | null;
  streakCount: number;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-0.5">
        <span className="font-display text-2xl font-bold text-vinke-ink dark:text-white">
          {saudacao}, {nome}
        </span>
        <span className="text-xs font-medium text-vinke-ink3">
          {hoje}
          {diasParaProva != null ? ` · faltam ${diasParaProva} dias para o ENEM` : ""}
        </span>
      </div>
      {streakCount > 0 ? (
        <div className="flex items-center gap-2 rounded-full border-[1.5px] border-vinke-line bg-white px-3.5 py-2 dark:border-vinke-navy-line dark:bg-vinke-navy-card">
          <Flame size={14} className="text-[#F0A63A]" aria-hidden="true" />
          <span className="font-display text-[13px] font-bold text-vinke-ink dark:text-white">
            {streakCount} {streakCount === 1 ? "dia" : "dias"}
          </span>
          <span className="text-[11px] font-semibold text-vinke-ink3">de sequência</span>
        </div>
      ) : null}
    </div>
  );
}

function GoalRing({ pct }: { pct: number }) {
  const r = 24;
  const c = 2 * Math.PI * r;
  const filled = Math.min(100, Math.max(0, pct)) / 100;
  const complete = pct >= 100;
  return (
    <div className="relative h-[58px] w-[58px] shrink-0">
      <svg viewBox="0 0 58 58" width="58" height="58">
        <circle
          cx="29"
          cy="29"
          r={r}
          fill="none"
          strokeWidth="7"
          className={complete ? "stroke-vinke-green-soft" : "stroke-vinke-line2 dark:stroke-vinke-navy-sel"}
        />
        <circle
          cx="29"
          cy="29"
          r={r}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${c * filled} ${c}`}
          transform="rotate(-90 29 29)"
          className={complete ? "stroke-vinke-green" : "stroke-vinke"}
        />
      </svg>
      <div
        className={cn(
          "absolute inset-0 flex items-center justify-center font-display text-[13px] font-bold",
          complete ? "text-vinke-green-text dark:text-vinke-green" : "text-vinke-ink dark:text-white"
        )}
      >
        {complete ? "✓" : `${pct}%`}
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: string;
  hint: string;
  href?: string;
}) {
  const inner = (
    <>
      <span className="text-[9px] font-semibold tracking-[0.1em] text-vinke-ink3">{label}</span>
      <span className="font-display text-2xl font-bold text-vinke-ink dark:text-white [font-variant-numeric:tabular-nums]">
        {value}
      </span>
      <span className="text-[10px] font-semibold text-vinke-ink3">{hint}</span>
    </>
  );
  if (href) {
    return (
      <Link href={href} className="flex flex-col rounded-2xl bg-white p-4 transition hover:bg-vinke-sel dark:border dark:border-vinke-navy-line dark:bg-vinke-navy-card dark:hover:bg-vinke-navy-sel">
        {inner}
      </Link>
    );
  }
  return (
    <div className="flex flex-col rounded-2xl bg-white p-4 dark:border dark:border-vinke-navy-line dark:bg-vinke-navy-card">
      {inner}
    </div>
  );
}
