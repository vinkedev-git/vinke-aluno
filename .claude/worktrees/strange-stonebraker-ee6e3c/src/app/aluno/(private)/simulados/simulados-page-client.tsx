"use client";

import { useEffect, useMemo, useState } from "react";
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

import { Button } from "@/components/ui/button";
import { SkeletonList } from "@/components/ui/skeleton";
import { Plus, RefreshCw, Trash2, ChevronRight, Clock, CheckCircle2, Brain } from "lucide-react";

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

function formatDate(ts: unknown) {
  try {
    if (!ts) return "—";
    const d =
      typeof ts === "object" && ts !== null && "toDate" in ts && typeof (ts as TimestampLike).toDate === "function"
        ? (ts as TimestampLike).toDate!()
        : ts instanceof Date
        ? ts
        : typeof ts === "string" || typeof ts === "number"
        ? new Date(ts)
        : null;
    if (!d) return "—";
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return "—";
  }
}

function toMillis(ts: unknown) {
  try {
    if (!ts) return 0;
    const d =
      typeof ts === "object" && ts !== null && "toDate" in ts && typeof (ts as TimestampLike).toDate === "function"
        ? (ts as TimestampLike).toDate!()
        : ts instanceof Date
        ? ts
        : typeof ts === "string" || typeof ts === "number"
        ? new Date(ts)
        : null;
    return d ? d.getTime() : 0;
  } catch {
    return 0;
  }
}

function cleanTitle(raw?: string) {
  const titleRaw = String(raw ?? "").trim();
  if (!titleRaw) return { subtitle: "" };
  const parts = titleRaw.split("•").map((p) => p.trim()).filter(Boolean);
  const rest = parts.slice(1).filter((p) => {
    const t = p.toLowerCase();
    return t !== "todos" && t !== "todas";
  });
  return { subtitle: rest.join(" • ") };
}

function ScoreBadge({ value, answered }: { value: number; answered: number }) {
  if (answered === 0) return <span className="text-slate-400 dark:text-slate-600">—</span>;
  const color =
    value >= 70
      ? "text-emerald-600 dark:text-emerald-400"
      : value >= 50
      ? "text-amber-600 dark:text-amber-400"
      : "text-rose-600 dark:text-rose-400";
  return <span className={cn("font-black", color)}>{value}%</span>;
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

  useEffect(() => { load(); }, []);

  const stats = useMemo(() => ({
    total: sessions.length,
    inProgress: sessions.filter((s) => s.status === "in_progress").length,
    completed: sessions.filter((s) => s.status === "completed").length,
  }), [sessions]);

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
    <div className="space-y-6 overflow-x-hidden">

      {/* Hero header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-500">Meus</div>
          <div className="mt-0.5 text-3xl font-black text-slate-900 dark:text-slate-100">Simulados</div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={load} disabled={loading} className="gap-2">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Atualizar
          </Button>
          <Button onClick={() => router.push("/aluno/simulados/novo")} className="gap-2">
            <Plus size={14} />
            Novo simulado
          </Button>
        </div>
      </div>

      {/* Métricas resumo */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 dark:border-slate-800/80 dark:bg-slate-900/50">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-500">Total</div>
          <div className="mt-1 text-2xl font-black text-slate-900 dark:text-slate-100">{stats.total || "—"}</div>
        </div>
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 px-4 py-4 dark:border-indigo-900/30 dark:bg-indigo-950/20">
          <div className="text-[11px] font-bold uppercase tracking-wide text-indigo-500 dark:text-indigo-400">Andamento</div>
          <div className="mt-1 text-2xl font-black text-indigo-700 dark:text-indigo-300">{stats.inProgress || "—"}</div>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 px-4 py-4 dark:border-emerald-900/30 dark:bg-emerald-950/20">
          <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Concluídos</div>
          <div className="mt-1 text-2xl font-black text-emerald-700 dark:text-emerald-300">{stats.completed || "—"}</div>
        </div>
      </div>

      {/* Erro */}
      {err ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 dark:border-red-900/40 dark:bg-red-950/30">
          <p className="text-sm font-semibold text-red-700 dark:text-red-300">{err}</p>
          <Button className="mt-3" onClick={load}>Tentar novamente</Button>
        </div>
      ) : null}

      {/* Loading skeleton */}
      {loading && !sessions.length ? <SkeletonList rows={5} /> : null}

      {/* Vazio */}
      {!loading && !sessions.length && !err ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center dark:border-slate-700 dark:bg-slate-900/30">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800">
            <Brain size={24} className="text-slate-400" />
          </div>
          <div className="text-base font-black text-slate-900 dark:text-slate-100">Nenhum simulado ainda</div>
          <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">Crie seu primeiro simulado e comece a praticar.</div>
          <Button className="mt-5 gap-2" onClick={() => router.push("/aluno/simulados/novo")}>
            <Plus size={14} />
            Criar primeiro simulado
          </Button>
        </div>
      ) : null}

      {/* Lista */}
      <div className="grid gap-3">
        {sessions.map((s) => {
          const display = String(s.titleDisplay ?? "").trim() || String(s.title ?? "").trim();
          const { subtitle } = cleanTitle(display);
          const number = sessionNumberById.get(s.id) ?? 1;
          const numberedTitle = `Simulado ${String(number).padStart(2, "0")}`;

          const total = Number(s.totalQuestions ?? 0) || 0;
          const answeredRaw = Number(s.answeredCount ?? 0) || 0;
          const answered = total > 0 ? Math.min(answeredRaw, total) : answeredRaw;
          const correct = Number(s.correctCount ?? 0) || 0;
          const percent =
            Number.isFinite(s.scorePercent) && s.scorePercent != null
              ? Number(s.scorePercent)
              : total > 0 ? Math.round((correct / total) * 100) : 0;

          const isCompleted = s.status === "completed";
          const progressPct = total > 0 ? Math.min(100, Math.round((answered / total) * 100)) : 0;

          return (
            <div
              key={s.id}
              className="group rounded-2xl border border-slate-200 bg-white transition hover:border-slate-300 hover:shadow-sm dark:border-slate-800/80 dark:bg-slate-900/50 dark:hover:border-slate-700"
            >
              <div className="flex min-w-0 flex-col gap-4 p-5 sm:flex-row sm:items-center">

                {/* Status icon */}
                <div className={cn(
                  "hidden shrink-0 sm:flex h-11 w-11 items-center justify-center rounded-2xl",
                  isCompleted
                    ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400"
                    : "bg-indigo-100 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400"
                )}>
                  {isCompleted ? <CheckCircle2 size={20} /> : <Clock size={20} />}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-slate-900 dark:text-slate-100">{numberedTitle}</span>
                    <span className={cn(
                      "shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-bold",
                      isCompleted
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300"
                        : "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900/40 dark:bg-indigo-950/30 dark:text-indigo-300"
                    )}>
                      {isCompleted ? "Concluído" : "Em andamento"}
                    </span>
                  </div>

                  {subtitle ? (
                    <div className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{subtitle}</div>
                  ) : null}

                  {/* Stats row */}
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                    <span>{answered}/{total || "—"} respondidas</span>
                    <span>{correct} acertos</span>
                    <span>
                      Nota: <ScoreBadge value={percent} answered={answered} />
                    </span>
                    <span className="ml-auto hidden sm:inline">{formatDate(s.updatedAt)}</span>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        isCompleted ? "bg-emerald-500" : "bg-indigo-500"
                      )}
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => onDelete(s.id)}
                    disabled={deletingId === s.id}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40 dark:border-slate-700 dark:text-slate-500 dark:hover:border-rose-900/40 dark:hover:bg-rose-950/30 dark:hover:text-rose-400"
                    aria-label="Excluir simulado"
                  >
                    <Trash2 size={15} />
                  </button>

                  <Button
                    className="gap-1.5"
                    onClick={() =>
                      router.push(
                        isCompleted
                          ? `/aluno/simulados/${s.id}/resultado`
                          : `/aluno/simulados/${s.id}`
                      )
                    }
                  >
                    {isCompleted ? "Resultado" : "Retomar"}
                    <ChevronRight size={14} />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

