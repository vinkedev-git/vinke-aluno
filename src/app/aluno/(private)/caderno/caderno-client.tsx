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

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-56 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
        <SkeletonCard lines={3} />
        <SkeletonCard lines={3} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-500">Revisão</div>
        <div className="mt-0.5 text-3xl font-black text-slate-900 dark:text-slate-100">Caderno de Erros</div>
        <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          As questões que você errou ficam aqui automaticamente. Acerte de novo para marcá-las como resolvidas.
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => { setTab("pending"); setSelectedTema(null); }}
          className={cn(
            "flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold transition",
            tab === "pending"
              ? "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          )}
        >
          Pendentes
          <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-bold text-rose-600 dark:text-rose-300">
            {counts.pending}
          </span>
        </button>
        <button
          type="button"
          onClick={() => { setTab("resolved"); setSelectedTema(null); }}
          className={cn(
            "flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold transition",
            tab === "resolved"
              ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          )}
        >
          Resolvidas
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-300">
            {counts.resolved}
          </span>
        </button>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && !query && !selectedTema ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800/80 dark:bg-slate-900/50">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800">
            {tab === "pending" ? (
              <NotebookPen size={24} className="text-slate-400" />
            ) : (
              <CheckCircle2 size={24} className="text-emerald-400" />
            )}
          </div>
          <div className="mt-3 text-base font-black text-slate-900 dark:text-slate-100">
            {tab === "pending" ? "Nenhum erro por aqui 🎉" : "Nada resolvido ainda"}
          </div>
          <div className="mx-auto mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">
            {tab === "pending"
              ? "Quando você errar uma questão num simulado, ela aparecerá aqui automaticamente para revisão."
              : "Acerte de novo as questões pendentes para vê-las marcadas como resolvidas aqui."}
          </div>
          {tab === "pending" && (
            <Button className="mt-4 gap-2" onClick={() => router.push("/aluno/simulados/novo")}>
              <Sparkles size={14} />
              Fazer um simulado
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Filtros */}
          <div className="space-y-3">
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar no enunciado ou tema…"
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-blue-500"
              />
            </div>
            {allTemas.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedTema(null)}
                  className={cn(
                    "rounded-2xl border px-3 py-1 text-xs font-semibold transition",
                    selectedTema === null
                      ? "border-slate-900 bg-slate-900 text-white dark:border-blue-500 dark:bg-blue-500"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  )}
                >
                  Todos
                </button>
                {allTemas.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setSelectedTema((prev) => (prev === t ? null : t))}
                    className={cn(
                      "rounded-2xl border px-3 py-1 text-xs font-semibold transition",
                      selectedTema === t
                        ? "border-slate-900 bg-slate-900 text-white dark:border-blue-500 dark:bg-blue-500"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Refazer como simulado */}
          {tab === "pending" && filtered.length > 0 && (
            <div className="flex flex-col gap-3 rounded-2xl border border-indigo-200/70 bg-gradient-to-br from-indigo-50 to-blue-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-indigo-900/40 dark:from-indigo-950/30 dark:to-blue-950/20">
              <div className="text-sm text-slate-600 dark:text-slate-300">
                Treine com um simulado montado só com seus erros
                {selectedTema ? <> de <b className="text-slate-900 dark:text-slate-100">{selectedTema}</b></> : null}.
                {filtered.length > MAX_REVIEW_QUESTIONS && (
                  <span className="text-slate-500 dark:text-slate-400"> {" "}(usaremos {MAX_REVIEW_QUESTIONS} aleatórias de {filtered.length})</span>
                )}
              </div>
              <Button onClick={createReviewSimulado} disabled={creating} className="w-full gap-2 sm:w-auto">
                <Zap size={14} />
                {creating ? "Criando…" : `Refazer ${Math.min(filtered.length, MAX_REVIEW_QUESTIONS)} ${filtered.length === 1 ? "erro" : "erros"}`}
              </Button>
            </div>
          )}

          {/* Lista */}
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 dark:border-slate-800/80 dark:bg-slate-900/50 dark:text-slate-400">
              Nenhuma questão encontrada com esses filtros.
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((item) => (
                <ErrorCard key={item.id} item={item} tab={tab} onSetStatus={setStatus} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Item ────────────────────────────────────────────────────────────────────

function ErrorCard({
  item,
  tab,
  onSetStatus,
}: {
  item: ErrorDoc;
  tab: Tab;
  onSetStatus: (item: ErrorDoc, status: Tab) => void;
}) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<QuestionDoc | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [notFound, setNotFound] = useState(false);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !detail && !loadingDetail) {
      setLoadingDetail(true);
      try {
        const snap = await getDoc(doc(db, "questionsBank", item.questionId));
        if (snap.exists()) setDetail(snap.data() as QuestionDoc);
        else setNotFound(true);
      } catch {
        setNotFound(true);
      } finally {
        setLoadingDetail(false);
      }
    }
  }

  const correctId = detail ? getCorrectId(detail) : safeStr(item.correctOptionId).toUpperCase();
  const explanationHtml = detail ? toHtml(getExplanation(detail)) : "";
  const statementHtml = detail ? toHtml(getStatement(detail)) : "";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800/80 dark:bg-slate-900/50">
      {/* Top */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            {(item.temas ?? []).slice(0, 3).map((t) => (
              <span key={t} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {t}
              </span>
            ))}
            {(item.timesWrong ?? 0) > 0 && (
              <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-600 dark:text-rose-300">
                Errou {item.timesWrong}×
              </span>
            )}
          </div>
          <button onClick={toggle} className="mt-2 block text-left text-sm leading-6 text-slate-800 dark:text-slate-200">
            {item.enunciadoSnippet || "Questão sem enunciado."}
          </button>
        </div>
        <button
          onClick={toggle}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
          aria-label={open ? "Recolher" : "Ver questão"}
        >
          {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
      </div>

      {/* Detail */}
      {open && (
        <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
          {loadingDetail ? (
            <div className="space-y-2">
              <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            </div>
          ) : notFound ? (
            <div className="text-sm text-slate-400 italic">Não foi possível carregar esta questão.</div>
          ) : detail ? (
            <div className="space-y-4">
              {statementHtml && (
                <div
                  className="text-sm leading-6 text-slate-800 dark:text-slate-200 [&_p]:my-1 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:underline"
                  dangerouslySetInnerHTML={{ __html: statementHtml }}
                />
              )}

              {safeStr(detail.imageUrl) ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={safeStr(detail.imageUrl)}
                  alt="Imagem da questão"
                  className="max-h-56 w-auto rounded-xl border border-slate-200 dark:border-slate-700"
                />
              ) : null}

              {/* Alternativas */}
              {Array.isArray(detail.options) && detail.options.length > 0 && (
                <div className="space-y-1.5">
                  {detail.options.map((opt) => {
                    const oid = safeStr(opt.id).toUpperCase();
                    const isCorrect = oid === correctId;
                    const isChosen = oid === safeStr(item.lastSelectedOptionId).toUpperCase();
                    return (
                      <div
                        key={oid}
                        className={cn(
                          "flex items-start gap-2 rounded-xl border px-3 py-2 text-sm",
                          isCorrect
                            ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/30"
                            : isChosen
                            ? "border-rose-200 bg-rose-50 dark:border-rose-900/40 dark:bg-rose-950/30"
                            : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
                        )}
                      >
                        <span className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] font-black text-white",
                          isCorrect ? "bg-emerald-500" : isChosen ? "bg-rose-500" : "bg-slate-300 dark:bg-slate-600"
                        )}>
                          {oid}
                        </span>
                        <span className="min-w-0 text-slate-700 dark:text-slate-200">
                          <span className="block">{safeStr(opt.text) || "—"}</span>
                          {opt.imageUrl ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={opt.imageUrl}
                              alt=""
                              className="mt-2 max-h-36 rounded-lg border border-slate-200 dark:border-slate-700"
                            />
                          ) : null}
                        </span>
                        {isCorrect && <CheckCircle2 size={15} className="ml-auto shrink-0 text-emerald-500" />}
                        {isChosen && !isCorrect && <XCircle size={15} className="ml-auto shrink-0 text-rose-500" />}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Comentário */}
              {explanationHtml && (
                <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Comentário</div>
                  <div
                    className="mt-1 text-sm leading-6 text-slate-700 dark:text-slate-300 [&_p]:my-1 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:underline"
                    dangerouslySetInnerHTML={{ __html: explanationHtml }}
                  />
                </div>
              )}
            </div>
          ) : null}

          {/* Ações */}
          <div className="mt-4 flex justify-end">
            {tab === "pending" ? (
              <Button variant="secondary" className="gap-2" onClick={() => onSetStatus(item, "resolved")}>
                <CheckCircle2 size={14} />
                Marcar como resolvida
              </Button>
            ) : (
              <Button variant="secondary" className="gap-2" onClick={() => onSetStatus(item, "pending")}>
                <RotateCcw size={14} />
                Voltar para pendentes
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
