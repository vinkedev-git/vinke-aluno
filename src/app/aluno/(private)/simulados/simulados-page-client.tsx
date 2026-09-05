"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";

import { SkeletonList } from "@/components/ui/skeleton";
import { Plus, RefreshCw, Trash2, Brain } from "lucide-react";

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

type SessionDoc = {
  id: string;
  title?: string;
  titleDisplay?: string;
  status?: "in_progress" | "completed" | string;
  totalQuestions?: number;
  answeredCount?: number;
  correctCount?: number;
  scorePercent?: number;
  updatedAt?: unknown;
  createdAt?: unknown;
  control?: boolean;
  kind?: string;
};

type TimestampLike = {
  toDate?: () => Date;
};

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function toDateSafe(ts: unknown): Date | null {
  try {
    if (!ts) return null;
    if (typeof ts === "object" && ts !== null && "toDate" in ts && typeof (ts as TimestampLike).toDate === "function") {
      return (ts as TimestampLike).toDate!();
    }
    if (ts instanceof Date) return ts;
    if (typeof ts === "string" || typeof ts === "number") return new Date(ts);
    return null;
  } catch {
    return null;
  }
}

function formatDateShort(ts: unknown) {
  const d = toDateSafe(ts);
  if (!d) return "—";
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${d.getDate()} ${meses[d.getMonth()]}`;
}

function toMillis(ts: unknown) {
  return toDateSafe(ts)?.getTime() ?? 0;
}

function cleanTitle(raw?: string) {
  const titleRaw = String(raw ?? "").trim();
  if (!titleRaw) return { main: "Simulado", subtitle: "" };
  const parts = titleRaw.split("•").map((p) => p.trim()).filter(Boolean);
  const rest = parts.slice(1).filter((p) => {
    const t = p.toLowerCase();
    return t !== "todos" && t !== "todas";
  });
  return { main: parts[0] || "Simulado", subtitle: rest.join(" · ") };
}

export default function SimuladosPageClient() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<SessionDoc[]>([]);
  const [err, setErr] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    const u = auth.currentUser;
    if (!u) { setErr("Você precisa estar logado."); setLoading(false); return; }
    setLoading(true);
    setErr("");
    try {
      const ref = collection(db, "users", u.uid, "sessions");
      const snap = await getDocs(query(ref, orderBy("updatedAt", "desc")));
      setSessions(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SessionDoc, "id">) })));
    } catch (error: unknown) {
      setErr(getErrorMessage(error, "Falha ao carregar simulados."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const inProgress = useMemo(
    () => sessions.filter((s) => s.status === "in_progress"),
    [sessions]
  );
  const history = useMemo(
    () => sessions.filter((s) => s.status !== "in_progress"),
    [sessions]
  );

  const sessionNumberById = useMemo(() => {
    const map = new Map<string, number>();
    const ordered = [...sessions].sort((a, b) => {
      const d = toMillis(a.createdAt) - toMillis(b.createdAt);
      return d !== 0 ? d : toMillis(a.updatedAt) - toMillis(b.updatedAt);
    });
    ordered.forEach((s, i) => map.set(s.id, i + 1));
    return map;
  }, [sessions]);

  async function onDelete(sessionId: string) {
    const u = auth.currentUser;
    if (!u) return;
    const ok = window.confirm("Excluir este simulado? Isso não pode ser desfeito.");
    if (!ok) return;
    setDeletingId(sessionId);
    try {
      await deleteDoc(doc(db, "users", u.uid, "sessions", sessionId));
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (e) {
      console.error(e);
      alert("Não foi possível excluir.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-4 overflow-x-hidden pb-6">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-display text-2xl font-bold text-vinke-ink dark:text-white">Simulados</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-2 rounded-[9px] border-[1.5px] border-vinke-line bg-white px-4 py-2.5 text-xs font-bold text-vinke-ink transition hover:bg-vinke-offwhite disabled:opacity-60 dark:border-vinke-navy-line dark:bg-vinke-navy-card dark:text-slate-200"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} aria-hidden="true" />
            Atualizar
          </button>
          <Link
            href="/aluno/simulados/novo"
            className="flex items-center gap-2 rounded-[9px] bg-vinke px-4 py-2.5 text-xs font-bold text-white transition hover:bg-vinke-deep"
          >
            <Plus size={13} aria-hidden="true" />
            Novo simulado
          </Link>
        </div>
      </div>

      {/* Em andamento */}
      {inProgress.map((s) => {
        const total = Number(s.totalQuestions ?? 0) || 0;
        const answered = Math.min(Number(s.answeredCount ?? 0) || 0, total || Infinity);
        const pct = total > 0 ? Math.round((answered / total) * 100) : 0;
        const { main } = cleanTitle(s.titleDisplay || s.title);
        return (
          <div key={s.id} className="flex flex-col gap-3 rounded-2xl bg-vinke-navy p-5 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex flex-1 flex-col gap-0.5">
              <span className="text-[9px] font-semibold tracking-[0.12em] text-slate-400">EM ANDAMENTO</span>
              <span className="font-display text-[15px] font-bold text-white">
                {main} · {total} questões
              </span>
              <span className="text-[11px] font-medium text-slate-400">
                {answered} respondidas · atualizado {formatDateShort(s.updatedAt)}
              </span>
            </div>
            <div className="hidden h-[7px] w-32 rounded-full bg-vinke-navy-sel sm:block">
              <div className="h-[7px] rounded-full bg-vinke" style={{ width: `${pct}%` }} />
            </div>
            <Link
              href={`/aluno/simulados/${s.id}`}
              className="rounded-[9px] bg-white px-4 py-2.5 text-center text-xs font-bold text-vinke-navy transition hover:opacity-90"
            >
              Continuar
            </Link>
          </div>
        );
      })}

      {/* Erro */}
      {err ? (
        <div className="flex flex-col gap-2 rounded-2xl bg-vinke-red-soft p-5 dark:bg-vinke-red/10">
          <p className="text-sm font-semibold text-vinke-red dark:text-vinke-red-dark">{err}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="self-start rounded-[8px] border-[1.5px] border-vinke-red px-4 py-2 text-xs font-bold text-vinke-red"
          >
            Tentar novamente
          </button>
        </div>
      ) : null}

      {/* Loading skeleton */}
      {loading && !sessions.length ? <SkeletonList rows={5} /> : null}

      {/* Vazio */}
      {!loading && !sessions.length && !err ? (
        <div className="rounded-2xl border-[1.5px] border-dashed border-vinke-line bg-white px-6 py-12 text-center dark:border-vinke-navy-line dark:bg-vinke-navy-card">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-vinke-soft dark:bg-vinke/15">
            <Brain size={24} className="text-vinke" aria-hidden="true" />
          </div>
          <div className="font-display text-base font-bold text-vinke-ink dark:text-white">Nenhum simulado ainda</div>
          <div className="mt-1 text-sm text-vinke-ink3">Crie seu primeiro simulado e comece a praticar.</div>
          <button
            type="button"
            className="mt-5 inline-flex items-center gap-2 rounded-[9px] bg-vinke px-5 py-2.5 text-xs font-bold text-white transition hover:bg-vinke-deep"
            onClick={() => router.push("/aluno/simulados/novo")}
          >
            <Plus size={13} aria-hidden="true" />
            Criar primeiro simulado
          </button>
        </div>
      ) : null}

      {/* Histórico */}
      {history.length ? (
        <div className="overflow-hidden rounded-2xl bg-white dark:border dark:border-vinke-navy-line dark:bg-vinke-navy-card">
          <div className="hidden grid-cols-[2.2fr_1fr_0.9fr_0.8fr_0.9fr] gap-3 bg-[#FAFAF8] px-5 py-3 text-[9px] font-semibold tracking-[0.1em] text-vinke-ink3 sm:grid dark:bg-vinke-navy">
            <span>SIMULADO</span><span>DATA</span><span>ACERTOS</span><span>NOTA</span><span></span>
          </div>
          {history.map((s) => {
            const display = String(s.titleDisplay ?? "").trim() || String(s.title ?? "").trim();
            const { subtitle } = cleanTitle(display);
            const number = sessionNumberById.get(s.id) ?? 1;

            const total = Number(s.totalQuestions ?? 0) || 0;
            const answeredRaw = Number(s.answeredCount ?? 0) || 0;
            const answered = total > 0 ? Math.min(answeredRaw, total) : answeredRaw;
            const correct = Number(s.correctCount ?? 0) || 0;
            const percent =
              Number.isFinite(s.scorePercent) && s.scorePercent != null
                ? Math.round(Number(s.scorePercent))
                : answered > 0 ? Math.round((correct / answered) * 100) : 0;

            return (
              <div
                key={s.id}
                className="grid grid-cols-1 items-center gap-2 border-t border-vinke-line2 px-5 py-3.5 transition hover:bg-vinke-sel sm:grid-cols-[2.2fr_1fr_0.9fr_0.8fr_0.9fr] sm:gap-3 dark:border-vinke-navy-line dark:hover:bg-vinke-navy-sel/50"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-xs font-bold text-vinke-ink dark:text-slate-100">
                    Simulado {String(number).padStart(2, "0")}
                    {total ? ` · ${total} questões` : ""}
                  </span>
                  {subtitle ? (
                    <span className="truncate text-[10px] font-medium text-vinke-ink3">{subtitle}</span>
                  ) : null}
                </div>
                <span className="text-[11px] font-medium text-vinke-ink2 dark:text-slate-400">
                  {formatDateShort(s.updatedAt)}
                </span>
                <span className="font-display text-xs font-bold text-vinke-ink dark:text-slate-100 [font-variant-numeric:tabular-nums]">
                  {correct}/{answered || total}
                </span>
                <span
                  className={cn(
                    "justify-self-start rounded-full px-2.5 py-0.5 text-[11px] font-bold",
                    percent >= 70
                      ? "bg-vinke-green-soft text-vinke-green-text dark:bg-vinke-green/15 dark:text-vinke-green"
                      : "bg-vinke-line2 text-vinke-ink2 dark:bg-vinke-navy dark:text-slate-300"
                  )}
                >
                  {answered > 0 ? `${percent}%` : "—"}
                </span>
                <div className="flex items-center gap-3 justify-self-end">
                  <Link
                    href={`/aluno/simulados/${s.id}/resultado`}
                    className="text-[11px] font-bold text-vinke dark:text-vinke-lav"
                  >
                    Revisar
                  </Link>
                  <button
                    type="button"
                    title="Excluir"
                    onClick={() => void onDelete(s.id)}
                    disabled={deletingId === s.id}
                    className="text-vinke-ink4 transition hover:text-vinke-red disabled:opacity-50"
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
