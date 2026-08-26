"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

type AnswerItem = { selectedOptionId?: string; isCorrect?: boolean };

type SessionDoc = {
  id: string;
  status?: "in_progress" | "completed";
  totalQuestions?: number;
  answeredCount?: number;
  correctCount?: number;
  scorePercent?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
  title?: string;
  titleDisplay?: string;
  questionIds?: unknown;
  answersMap?: Record<string, AnswerItem>;
  filters?: { temas?: unknown };
  control?: boolean;
  kind?: string;
};

type QuestionRow = {
  id: string;
  index: number;
  snippet: string;
  assunto: string;
  selected: string;
  correct: string;
  status: "correct" | "wrong" | "blank";
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

function normalizeIdList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object" && "id" in item) {
        return String((item as { id?: unknown }).id ?? "").trim();
      }
      return "";
    })
    .filter(Boolean);
}

function stripHtml(html: string) {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDateShort(ts: unknown) {
  const ms = toMillis(ts);
  if (!ms) return "";
  const d = new Date(ms);
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${d.getDate()} ${meses[d.getMonth()]}`;
}

type Filtro = "erros" | "todas" | "branco";

export default function ResultadoClient({ sessionId }: { sessionId: string }) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [session, setSession] = useState<SessionDoc | null>(null);
  const [previousScores, setPreviousScores] = useState<number[]>([]);
  const [rows, setRows] = useState<QuestionRow[]>([]);
  const [rowsLoading, setRowsLoading] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>("erros");
  const [creating, setCreating] = useState(false);

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

      const [snap, listSnap] = await Promise.all([getDoc(ref), getDocs(sessionsRef)]);

      if (!snap.exists()) throw new Error("Sessão não encontrada.");
      const sess: SessionDoc = { id: snap.id, ...(snap.data() as Omit<SessionDoc, "id">) };
      setSession(sess);

      // notas das tentativas anteriores (concluídas, antes desta)
      const thisMs = toMillis(sess.createdAt);
      const prev = listSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<SessionDoc, "id">) }))
        .filter(
          (s) =>
            s.id !== sessionId &&
            s.status === "completed" &&
            safeNum(s.answeredCount) > 0 &&
            toMillis(s.createdAt) < thisMs
        )
        .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
        .slice(0, 2)
        .map((s) => Math.round(safeNum(s.scorePercent)))
        .reverse();
      setPreviousScores(prev);

      // linhas questão por questão (busca os docs das questões)
      setRowsLoading(true);
      const qids = normalizeIdList(sess.questionIds);
      const answers = sess.answersMap ?? {};
      const docs = await Promise.all(
        qids.map(async (qid, i) => {
          let snippet = "";
          let assunto = "";
          let correct = "";
          try {
            const qSnap = await getDoc(doc(db, "questionsBank", qid));
            if (qSnap.exists()) {
              const q = qSnap.data() as Record<string, unknown>;
              snippet = stripHtml(String(q.prompt_text ?? q.prompt ?? "")).slice(0, 90);
              const assuntos = Array.isArray(q.assuntos) ? q.assuntos : Array.isArray(q.themes) ? q.themes : [];
              assunto = String(assuntos[0] ?? q.disciplina ?? q.area ?? "").trim();
              correct = String(q.correctOptionId ?? "").trim();
            }
          } catch {
            /* ignora questão que falhou */
          }
          const ans = answers[qid];
          const selected = String(ans?.selectedOptionId ?? "").trim();
          const status: QuestionRow["status"] = !selected
            ? "blank"
            : ans?.isCorrect
              ? "correct"
              : "wrong";
          return { id: qid, index: i + 1, snippet, assunto, selected, correct, status };
        })
      );
      setRows(docs);
    } catch (error: unknown) {
      console.error(error);
      setErr(getErrorMessage(error, "Falha ao carregar resultado."));
    } finally {
      setLoading(false);
      setRowsLoading(false);
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
    const blank = Math.max(0, total - answered);
    const score = answered > 0 ? Math.round((correct / answered) * 100) : 0;
    return { total, answered, correct, errors, blank, score };
  }, [session]);

  // acerto por assunto (a partir das linhas)
  const porAssunto = useMemo(() => {
    const map = new Map<string, { total: number; correct: number }>();
    for (const r of rows) {
      if (r.status === "blank" || !r.assunto) continue;
      const cur = map.get(r.assunto) ?? { total: 0, correct: 0 };
      cur.total += 1;
      if (r.status === "correct") cur.correct += 1;
      map.set(r.assunto, cur);
    }
    return Array.from(map.entries())
      .map(([nome, v]) => ({ nome, ...v, pct: Math.round((v.correct / v.total) * 100) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [rows]);

  const melhorQueAnteriores =
    previousScores.length > 0 && previousScores.every((p) => stats.score > p);

  const filteredRows = useMemo(() => {
    if (filtro === "erros") return rows.filter((r) => r.status === "wrong");
    if (filtro === "branco") return rows.filter((r) => r.status === "blank");
    return rows;
  }, [rows, filtro]);

  async function verResolucao(rowIndex: number) {
    const u = auth.currentUser;
    if (!u) return;
    try {
      await updateDoc(doc(db, "users", u.uid, "sessions", sessionId), {
        currentIndex: rowIndex - 1,
      });
    } catch {
      /* segue mesmo sem persistir */
    }
    router.push(`/aluno/simulados/${sessionId}`);
  }

  async function refazerErros() {
    const u = auth.currentUser;
    if (!u || creating) return;
    const wrongIds = rows.filter((r) => r.status === "wrong").map((r) => r.id);
    if (!wrongIds.length) return;
    setCreating(true);
    try {
      const ref = await addDoc(collection(db, "users", u.uid, "sessions"), {
        title: `Refazer erros · Simulado`,
        titleDisplay: "Refazer erros",
        kind: "error_review",
        status: "in_progress",
        filters: { temas: [] },
        questionIds: wrongIds,
        totalQuestions: wrongIds.length,
        currentIndex: 0,
        answeredCount: 0,
        correctCount: 0,
        wrongCount: 0,
        scorePercent: 0,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      });
      router.push(`/aluno/simulados/${ref.id}`);
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-64 animate-pulse rounded-lg bg-vinke-line2 dark:bg-vinke-navy-sel" />
        <div className="h-40 animate-pulse rounded-2xl bg-vinke-line2 dark:bg-vinke-navy-sel" />
        <div className="h-72 animate-pulse rounded-2xl bg-vinke-line2 dark:bg-vinke-navy-sel" />
      </div>
    );
  }

  if (err) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl bg-vinke-red-soft px-5 py-5 dark:bg-vinke-red/10">
        <div className="font-semibold text-vinke-red dark:text-vinke-red-dark">{err}</div>
        <div className="flex gap-2">
          <Link
            href="/aluno/simulados"
            className="rounded-[9px] border-[1.5px] border-vinke-line bg-white px-4 py-2 text-xs font-bold text-vinke-ink dark:border-vinke-navy-line dark:bg-vinke-navy-card dark:text-slate-200"
          >
            Voltar
          </Link>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-[9px] bg-vinke px-4 py-2 text-xs font-bold text-white"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="space-y-4 pb-6">

      {/* Breadcrumb */}
      <div className="text-[11px] font-medium text-vinke-ink3">
        <Link href="/aluno/simulados" className="hover:underline">Simulados</Link>
        {" → "}
        <span className="font-bold text-vinke-ink dark:text-white">
          Resultado{formatDateShort(session.updatedAt) ? ` · ${formatDateShort(session.updatedAt)}` : ""}
        </span>
      </div>

      {/* Hero + acerto por assunto */}
      <div className="flex flex-col gap-3.5 lg:flex-row">
        <div className="flex flex-[1.2] items-center gap-6 rounded-2xl bg-vinke-navy p-6">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-[10px] font-semibold tracking-[0.12em] text-vinke-ink3">
              SEU RESULTADO
            </span>
            <div className="flex flex-wrap items-baseline gap-2.5">
              <span className="font-display text-[52px] font-bold leading-none text-white [font-variant-numeric:tabular-nums]">
                {stats.score}%
              </span>
              {melhorQueAnteriores ? (
                <span className="rounded-full bg-vinke-green-soft px-2.5 py-1 text-xs font-bold text-vinke-green-text">
                  ↑ melhor que {previousScores.length === 1 ? "a última" : `as ${previousScores.length} últimas`}
                </span>
              ) : null}
            </div>
            <span className="text-xs font-medium text-vinke-ink3">
              {stats.correct} acertos de {stats.answered} respondidas
              {stats.blank > 0 ? ` · ${stats.blank} em branco` : ""}
            </span>
          </div>
          {previousScores.length > 0 ? (
            <div className="ml-auto hidden items-end gap-2 sm:flex">
              {[...previousScores, stats.score].map((p, i, arr) => {
                const isLast = i === arr.length - 1;
                return (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <div
                      className={cn("w-7 rounded-t-md", isLast ? "bg-vinke-green" : "bg-vinke-navy-sel")}
                      style={{ height: `${Math.max(10, (p / 100) * 70)}px` }}
                    />
                    <span
                      className={cn(
                        "text-[9px] font-semibold",
                        isLast ? "font-bold text-vinke-green" : "text-vinke-ink3"
                      )}
                    >
                      {p}%
                    </span>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className="flex flex-1 flex-col gap-2.5 rounded-2xl bg-white p-5 dark:border dark:border-vinke-navy-line dark:bg-vinke-navy-card">
          <span className="font-display text-[13px] font-bold text-vinke-ink dark:text-white">
            Acerto por assunto
          </span>
          {rowsLoading ? (
            <span className="text-xs text-vinke-ink3">Calculando…</span>
          ) : porAssunto.length ? (
            <div className="flex flex-col gap-2">
              {porAssunto.map((a) => (
                <div key={a.nome} className="flex items-center gap-2.5">
                  <span className="w-[110px] shrink-0 truncate text-[11px] font-semibold text-vinke-ink dark:text-slate-200">
                    {a.nome}
                  </span>
                  <div className="h-1.5 min-w-0 flex-1 rounded-full bg-vinke-line2 dark:bg-vinke-navy-sel">
                    <div className="h-1.5 rounded-full bg-vinke" style={{ width: `${a.pct}%` }} />
                  </div>
                  <span className="shrink-0 font-display text-[11px] font-bold text-vinke-ink dark:text-white">
                    {a.correct}/{a.total}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <span className="text-xs text-vinke-ink3">
              Sem classificação por assunto nestas questões.
            </span>
          )}
          <div className="mt-auto flex flex-wrap gap-2 pt-2">
            {stats.errors > 0 ? (
              <button
                type="button"
                onClick={() => void refazerErros()}
                disabled={creating}
                className="rounded-[9px] bg-vinke px-3.5 py-2.5 text-[11px] font-bold text-white transition hover:bg-vinke-deep disabled:opacity-60"
              >
                {creating ? "Preparando…" : `Refazer os ${stats.errors} erros`}
              </button>
            ) : null}
            <Link
              href="/aluno/simulados/novo"
              className="rounded-[9px] border-[1.5px] border-vinke-line px-3.5 py-2.5 text-[11px] font-bold text-vinke-ink transition hover:bg-vinke-offwhite dark:border-vinke-navy-line dark:text-slate-200 dark:hover:bg-vinke-navy-sel"
            >
              Criar simulado parecido
            </Link>
          </div>
        </div>
      </div>

      {/* Questão por questão */}
      <div className="overflow-hidden rounded-2xl bg-white dark:border dark:border-vinke-navy-line dark:bg-vinke-navy-card">
        <div className="flex flex-wrap items-center gap-2.5 px-5 py-4">
          <span className="font-display text-[13px] font-bold text-vinke-ink dark:text-white">
            Questão por questão
          </span>
          <FiltroChip
            active={filtro === "erros"}
            tone="red"
            onClick={() => setFiltro("erros")}
            label={`só erros (${stats.errors})`}
          />
          <FiltroChip
            active={filtro === "todas"}
            onClick={() => setFiltro("todas")}
            label="todas"
          />
          {stats.blank > 0 ? (
            <FiltroChip
              active={filtro === "branco"}
              onClick={() => setFiltro("branco")}
              label={`em branco (${stats.blank})`}
            />
          ) : null}
        </div>

        {rowsLoading ? (
          <div className="px-5 pb-5 text-xs text-vinke-ink3">Carregando questões…</div>
        ) : filteredRows.length === 0 ? (
          <div className="px-5 pb-5 text-xs text-vinke-ink3">
            {filtro === "erros" ? "Nenhum erro — mandou bem! 🎉" : "Nada por aqui."}
          </div>
        ) : (
          filteredRows.map((r) => (
            <div
              key={r.id}
              className="grid grid-cols-[44px_1fr_90px] items-center gap-3 border-t border-vinke-line2 px-5 py-3 sm:grid-cols-[44px_1fr_130px_110px_90px] dark:border-vinke-navy-line"
            >
              <span
                className={cn(
                  "flex h-[26px] w-[26px] items-center justify-center rounded-lg text-[11px] font-bold",
                  r.status === "correct"
                    ? "bg-vinke-green-soft text-vinke-green-text dark:bg-vinke-green/15 dark:text-vinke-green"
                    : r.status === "wrong"
                      ? "bg-vinke-red-soft text-vinke-red dark:bg-vinke-red/15 dark:text-vinke-red-dark"
                      : "bg-vinke-line2 text-vinke-ink2 dark:bg-vinke-navy dark:text-slate-400"
                )}
              >
                {r.status === "correct" ? "✓" : r.status === "wrong" ? "✗" : "—"}
              </span>
              <span className="min-w-0 truncate text-xs font-medium text-vinke-ink dark:text-slate-200">
                Q{r.index}
                {r.snippet ? ` · ${r.snippet}…` : ""}
              </span>
              <span className="hidden truncate text-[10px] font-semibold text-vinke-ink3 sm:block">
                {r.assunto || "—"}
              </span>
              <span className="hidden text-[11px] font-semibold sm:block">
                {r.status === "blank" ? (
                  <span className="text-vinke-amber dark:text-vinke-amber-bar">Em branco</span>
                ) : r.status === "correct" ? (
                  <span className="text-vinke-ink2 dark:text-slate-400">Você: {r.selected} ✓</span>
                ) : (
                  <span className="text-vinke-ink2 dark:text-slate-400">
                    Você: {r.selected} · Certa: {r.correct || "?"}
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => void verResolucao(r.index)}
                className="text-right text-[11px] font-bold text-vinke dark:text-vinke-lav"
              >
                {r.status === "blank" ? "Responder" : "Ver resolução"}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function FiltroChip({
  label,
  active,
  tone,
  onClick,
}: {
  label: string;
  active: boolean;
  tone?: "red";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-2.5 py-1 text-[10px] font-bold transition",
        active
          ? tone === "red"
            ? "bg-vinke-red-soft text-vinke-red dark:bg-vinke-red/15 dark:text-vinke-red-dark"
            : "bg-vinke-navy text-white dark:bg-white dark:text-vinke-navy"
          : "text-vinke-ink3 hover:text-vinke-ink dark:hover:text-slate-200"
      )}
    >
      {label}
    </button>
  );
}
