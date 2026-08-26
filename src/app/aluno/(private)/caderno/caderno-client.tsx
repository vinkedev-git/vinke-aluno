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
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { SkeletonCard } from "@/components/ui/skeleton";
import {
  NotebookPen,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Search,
  Sparkles,
  Zap,
} from "lucide-react";

const MAX_REVIEW_QUESTIONS = 30;

// ─── Types ──────────────────────────────────────────────────────────────────

type ErrorDoc = {
  id: string;
  questionId: string;
  temas?: string[];
  enunciadoSnippet?: string;
  correctOptionId?: string | null;
  lastSelectedOptionId?: string | null;
  timesWrong?: number;
  timesCorrect?: number;
  status?: "pending" | "resolved";
};

type QuestionOption = { id: string; text?: string; imageUrl?: string | null };

type QuestionDoc = {
  options?: QuestionOption[];
  enunciado?: unknown;
  statement?: unknown;
  prompt?: unknown;
  pergunta?: unknown;
  title?: unknown;
  text?: unknown;
  question?: unknown;
  correctOptionId?: unknown;
  correctOption?: unknown;
  correct?: unknown;
  gabarito?: unknown;
  explanation?: unknown;
  comentario?: unknown;
  comment?: unknown;
  imageUrl?: string | null;
};

type Tab = "pending" | "resolved";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function safeStr(v: unknown): string {
  return String(v ?? "").trim();
}

function getStatement(q: QuestionDoc): string {
  return safeStr(
    q.enunciado ?? q.statement ?? q.prompt ?? q.pergunta ?? q.title ?? q.text ?? q.question
  );
}

function getCorrectId(q: QuestionDoc): string {
  return safeStr(q.correctOptionId ?? q.correctOption ?? q.correct ?? q.gabarito).toUpperCase();
}

function getExplanation(q: QuestionDoc): string {
  return safeStr(q.explanation ?? q.comentario ?? q.comment ?? "");
}

const ALLOWED_TAGS = new Set(["p", "br", "strong", "b", "em", "i", "u", "sub", "sup", "span", "ul", "ol", "li", "blockquote", "code", "pre"]);

function sanitizeRich(raw: string): string {
  if (typeof window === "undefined") return raw;
  const parser = new DOMParser();
  const d = parser.parseFromString(raw, "text/html");
  d.querySelectorAll("script,style,iframe,object,embed").forEach((n) => n.remove());
  Array.from(d.body.querySelectorAll("*")).forEach((el) => {
    if (!ALLOWED_TAGS.has(el.tagName.toLowerCase())) {
      const frag = d.createDocumentFragment();
      while (el.firstChild) frag.appendChild(el.firstChild);
      el.replaceWith(frag);
    } else {
      Array.from(el.attributes).forEach((attr) => {
        if (attr.name.startsWith("on") || attr.name === "style") el.removeAttribute(attr.name);
      });
    }
  });
  return d.body.innerHTML;
}

function toHtml(raw: string): string {
  if (!raw.trim()) return "";
  return /<[a-z][\s\S]*>/i.test(raw) ? sanitizeRich(raw) : raw.replace(/\n/g, "<br>");
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CadernoClient() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ErrorDoc[]>([]);
  const [tab, setTab] = useState<Tab>("pending");
  const [query, setQuery] = useState("");
  const [selectedTema, setSelectedTema] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const u = auth.currentUser;
    if (!u) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "users", u.uid, "errorNotebook"));
      setItems(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ErrorDoc, "id">) }))
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const pending = items.filter((i) => (i.status ?? "pending") === "pending").length;
    const resolved = items.filter((i) => i.status === "resolved").length;
    return { pending, resolved };
  }, [items]);

  const allTemas = useMemo(() => {
    const set = new Set<string>();
    items
      .filter((i) => (i.status ?? "pending") === tab)
      .forEach((i) => (i.temas ?? []).forEach((t) => set.add(t)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [items, tab]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((i) => (i.status ?? "pending") === tab)
      .filter((i) => (selectedTema ? (i.temas ?? []).includes(selectedTema) : true))
      .filter((i) =>
        q
          ? (i.enunciadoSnippet ?? "").toLowerCase().includes(q) ||
            (i.temas ?? []).some((t) => t.toLowerCase().includes(q))
          : true
      )
      .sort((a, b) => (b.timesWrong ?? 0) - (a.timesWrong ?? 0));
  }, [items, tab, query, selectedTema]);

  async function setStatus(item: ErrorDoc, status: Tab) {
    const u = auth.currentUser;
    if (!u) return;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status } : i)));
    try {
      await setDoc(
        doc(db, "users", u.uid, "errorNotebook", item.id),
        {
          status,
          ...(status === "resolved" ? { resolvedAt: serverTimestamp() } : {}),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (e) {
      console.error(e);
      void load();
    }
  }

  async function createReviewSimulado() {
    const u = auth.currentUser;
    if (!u || creating) return;
    const ids = filtered.map((i) => i.questionId).filter(Boolean);
    if (!ids.length) return;

    // Embaralha e limita
    const shuffled = [...ids];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const questionIds = shuffled.slice(0, MAX_REVIEW_QUESTIONS);

    setCreating(true);
    try {
      const ref = await addDoc(collection(db, "users", u.uid, "sessions"), {
        title: "Revisão de erros",
        titleDisplay: "Revisão de erros",
        kind: "error_review",
        status: "in_progress",
        filters: {
          provas: [],
          provaIds: [],
          niveis: [],
          temas: selectedTema ? [selectedTema] : [],
        },
        questionIds,
        totalQuestions: questionIds.length,
        currentIndex: 0,
        answeredCount: 0,
        correctCount: 0,
        wrongCount: 0,
        scorePercent: 0,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      });
      router.push(`/aluno/simulados/${ref.id}`);
    } catch (e) {
      console.error(e);
      setCreating(false);
    }
  }
  async function refazerUma(item: ErrorDoc) {
    const u = auth.currentUser;
    if (!u || creating || !item.questionId) return;
    setCreating(true);
    try {
      const ref = await addDoc(collection(db, "users", u.uid, "sessions"), {
        title: "Refazer erro",
        titleDisplay: "Refazer erro",
        kind: "error_review",
        status: "in_progress",
        filters: { provas: [], provaIds: [], niveis: [], temas: item.temas ?? [] },
        questionIds: [item.questionId],
        totalQuestions: 1,
        currentIndex: 0,
        answeredCount: 0,
        correctCount: 0,
        wrongCount: 0,
        scorePercent: 0,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      });
      router.push(`/aluno/simulados/${ref.id}`);
    } catch (e) {
      console.error(e);
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-56 animate-pulse rounded-2xl bg-vinke-line2 dark:bg-vinke-navy-sel" />
        <SkeletonCard lines={3} />
        <SkeletonCard lines={3} />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-6">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="font-display text-2xl font-bold text-vinke-ink dark:text-white">Caderno de erros</span>
          <span className="text-xs font-medium text-vinke-ink3">Toda questão errada cai aqui até você dominar.</span>
        </div>
        {tab === "pending" && counts.pending > 0 ? (
          <button
            type="button"
            onClick={() => void createReviewSimulado()}
            disabled={creating}
            className="rounded-[9px] bg-vinke px-4 py-2.5 text-xs font-bold text-white transition hover:bg-vinke-deep disabled:opacity-60"
          >
            {creating ? "Preparando…" : `Refazer ${Math.min(counts.pending, MAX_REVIEW_QUESTIONS)} aleatórias`}
          </button>
        ) : null}
      </div>

      {/* Abas + busca + filtro */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-0.5 rounded-[10px] bg-white p-[3px] dark:bg-vinke-navy-card">
          <button
            type="button"
            onClick={() => { setTab("pending"); setSelectedTema(null); }}
            className={cn(
              "rounded-lg px-3.5 py-[7px] text-[11px] transition",
              tab === "pending"
                ? "bg-vinke-navy font-bold text-white dark:bg-white dark:text-vinke-navy"
                : "font-semibold text-vinke-ink3"
            )}
          >
            Pendentes · {counts.pending}
          </button>
          <button
            type="button"
            onClick={() => { setTab("resolved"); setSelectedTema(null); }}
            className={cn(
              "rounded-lg px-3.5 py-[7px] text-[11px] transition",
              tab === "resolved"
                ? "bg-vinke-navy font-bold text-white dark:bg-white dark:text-vinke-navy"
                : "font-semibold text-vinke-ink3"
            )}
          >
            Resolvidas · {counts.resolved}
          </button>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar no enunciado ou assunto…"
          className="min-w-0 flex-1 rounded-[9px] border-[1.5px] border-vinke-line bg-white px-3 py-2 text-xs font-medium text-vinke-ink outline-none placeholder:text-vinke-ink3 focus:border-vinke focus:ring-[3px] focus:ring-vinke-ring dark:border-vinke-navy-line dark:bg-vinke-navy-card dark:text-slate-200"
        />
        {allTemas.length > 0 ? (
          <select
            value={selectedTema ?? ""}
            onChange={(e) => setSelectedTema(e.target.value || null)}
            className="rounded-[9px] border-[1.5px] border-vinke-line bg-white px-3 py-2 text-xs font-semibold text-vinke-ink outline-none dark:border-vinke-navy-line dark:bg-vinke-navy-card dark:text-slate-200"
          >
            <option value="">Todos os assuntos</option>
            {allTemas.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        ) : null}
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[12px] border-[1.5px] border-dashed border-vinke-line bg-white p-8 text-center dark:border-vinke-navy-line dark:bg-vinke-navy-card">
          <span className="font-display text-[15px] font-bold text-vinke-ink dark:text-white">
            {tab === "pending"
              ? query || selectedTema ? "Nada com esses filtros" : "Caderno em dia!"
              : "Nenhuma resolvida ainda"}
          </span>
          <span className="max-w-sm text-[11px] font-medium text-vinke-ink3">
            {tab === "pending"
              ? query || selectedTema
                ? "Tente outra busca ou limpe o filtro de assunto."
                : "Nenhum erro pendente. Cada questão errada daqui pra frente aparece aqui para você refazer."
              : "Quando você refizer e acertar (ou marcar como dominada), a questão vem para cá."}
          </span>
          {tab === "pending" && !query && !selectedTema ? (
            <button
              type="button"
              onClick={() => router.push("/aluno/simulados/novo")}
              className="mt-1 rounded-[8px] bg-vinke px-4 py-2 text-[11px] font-bold text-white transition hover:bg-vinke-deep"
            >
              Praticar questões novas
            </button>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="flex flex-col gap-3 rounded-[12px] bg-white p-4 sm:flex-row sm:items-center dark:border dark:border-vinke-navy-line dark:bg-vinke-navy-card"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-xs font-semibold leading-relaxed text-vinke-ink dark:text-slate-200">
                  {item.enunciadoSnippet || "Questão"}
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {(item.temas ?? []).slice(0, 2).map((t) => (
                    <span key={t} className="rounded-full bg-vinke-soft px-2 py-0.5 text-[9px] font-bold text-vinke dark:bg-vinke/15 dark:text-vinke-lav">
                      {t}
                    </span>
                  ))}
                  {(item.timesWrong ?? 0) > 1 ? (
                    <span className="text-[10px] font-medium text-vinke-ink3">
                      errou {item.timesWrong}×
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => void refazerUma(item)}
                  disabled={creating}
                  className="rounded-lg bg-vinke px-3.5 py-2 text-[10px] font-bold text-white transition hover:bg-vinke-deep disabled:opacity-60"
                >
                  Refazer
                </button>
                {tab === "pending" ? (
                  <button
                    type="button"
                    onClick={() => void setStatus(item, "resolved")}
                    className="text-[10px] font-bold text-vinke-ink3 transition hover:text-vinke-green-text dark:hover:text-vinke-green"
                  >
                    Dominei
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void setStatus(item, "pending")}
                    className="text-[10px] font-bold text-vinke-ink3 transition hover:text-vinke-ink dark:hover:text-slate-200"
                  >
                    Voltar p/ pendentes
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
