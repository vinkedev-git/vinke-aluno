"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { recordFlashcardSession } from "@/lib/study-tracking";
import {
  collection,
  doc,
  getDocs,
  setDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { Button } from "@/components/ui/button";
import {
  RotateCcw,
  ChevronLeft,
  CheckCircle2,
  XCircle,
  Minus,
  Trophy,
  Brain,
  Eye,
  Layers,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type QuestionDoc = {
  id: string;
  prompt?: string;
  pergunta?: string;
  enunciado?: string;
  statement?: string;
  title?: string;
  text?: string;
  question?: string;
  options?: Array<{ id: string; text?: string; imageUrl?: string | null }>;
  correctOptionId?: string;
  correctOption?: string;
  correct?: string;
  gabarito?: string;
  explanation?: unknown;
  comentario?: unknown;
  comment?: unknown;
  imageUrl?: string | null;
  themes?: unknown;
  temas?: unknown;
  tema?: unknown;
  theme?: unknown;
  topic?: unknown;
};

type FlashcardDoc = {
  box: number;
  nextReview: number;
  lastReviewed: number;
  totalSeen: number;
  totalKnew: number;
};

type CardItem = {
  question: QuestionDoc;
  state: FlashcardDoc | null; // null = new card
};

type Rating = "knew" | "almost" | "didnt_know";
type Phase = "loading" | "error" | "studying" | "done";

// ─── Constants ────────────────────────────────────────────────────────────────

const BOX_DAYS = [0, 1, 3, 7, 14, 30]; // box index = days until review
const MAX_CARDS = 20;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function safeStr(v: unknown): string {
  return String(v ?? "").trim();
}

function tsToMs(v: unknown): number {
  if (!v) return 0;
  if (v instanceof Timestamp) return v.toMillis();
  if (typeof v === "object" && v !== null && "toMillis" in v) {
    return (v as { toMillis: () => number }).toMillis();
  }
  if (typeof v === "number") return v;
  return 0;
}

function getStatement(q: QuestionDoc): string {
  return safeStr(
    q.enunciado ?? q.statement ?? q.prompt ?? q.pergunta ?? q.title ?? q.text ?? q.question
  );
}

function getCorrectOption(q: QuestionDoc): { label: string; text: string } {
  const id = safeStr(q.correctOptionId ?? q.correctOption ?? q.correct ?? q.gabarito);
  if (!id) return { label: "", text: "" };

  if (q.options?.length) {
    const opt = q.options.find((o) => safeStr(o.id).toUpperCase() === id.toUpperCase());
    if (opt) return { label: id.toUpperCase(), text: safeStr(opt.text) };
  }
  return { label: id.toUpperCase(), text: "" };
}

function getExplanation(q: QuestionDoc): string {
  return safeStr(q.explanation ?? q.comentario ?? q.comment ?? "");
}

// Flashcards só fazem sentido com comentário/gabarito explicado.
// Exclui questões sem comentário ou com placeholder ("em breve…").
function hasUsableExplanation(q: QuestionDoc): boolean {
  const raw = getExplanation(q);
  if (!raw) return false;
  const text = raw
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!text) return false;
  if (text.includes("em breve")) return false;
  return true;
}

function extractThemes(q: QuestionDoc): string[] {
  const arr: string[] = [];
  if (Array.isArray(q.themes)) arr.push(...q.themes.map(safeStr).filter(Boolean));
  if (Array.isArray(q.temas)) arr.push(...q.temas.map(safeStr).filter(Boolean));
  [q.tema, q.theme, q.topic].map(safeStr).filter(Boolean).forEach((t) => arr.push(t));
  return [...new Set(arr)];
}

function getNextBox(currentBox: number, rating: Rating): number {
  if (rating === "knew") return Math.min((currentBox || 1) + 1, 5);
  if (rating === "almost") return currentBox || 1;
  return 1; // didn't know: back to box 1
}

function getNextReviewMs(newBox: number): number {
  const days = BOX_DAYS[newBox] ?? 1;
  return Date.now() + days * 24 * 60 * 60 * 1000;
}

// Minimal HTML sanitizer (same approach as quiz-client)
const ALLOWED_TAGS = new Set(["p", "br", "strong", "b", "em", "i", "u", "span", "ul", "ol", "li", "blockquote", "code", "pre"]);

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
  return /<[a-z][\s\S]*>/i.test(raw)
    ? sanitizeRich(raw)
    : raw.replace(/\n/g, "<br>");
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EstudarClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const selectedTemas = useMemo(() => {
    const raw = searchParams.get("temas") ?? "";
    return raw ? raw.split(",").map((t) => t.trim()).filter(Boolean) : [];
  }, [searchParams]);

  const [phase, setPhase] = useState<Phase>("loading");
  const [errMsg, setErrMsg] = useState("");
  const [cards, setCards] = useState<CardItem[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [sessionResults, setSessionResults] = useState<{ rating: Rating; questionId: string }[]>([]);

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    const u = auth.currentUser;
    if (!u) { setErrMsg("Você precisa estar logado."); setPhase("error"); return; }

    setPhase("loading");
    try {
      const [qbSnap, fcSnap] = await Promise.all([
        getDocs(collection(db, "questionsBank")),
        getDocs(collection(db, "users", u.uid, "flashcards")),
      ]);

      // Build user flashcard state map
      const fcMap = new Map<string, FlashcardDoc>();
      fcSnap.docs.forEach((d) => {
        fcMap.set(d.id, d.data() as FlashcardDoc);
      });

      // Build question list, filtered by theme
      const now = Date.now();
      const allQuestions: QuestionDoc[] = qbSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<QuestionDoc, "id">),
      }));

      const byTheme = selectedTemas.length === 0
        ? allQuestions
        : allQuestions.filter((q) => {
            const qt = extractThemes(q);
            return selectedTemas.some((st) =>
              qt.some((t) => t.toLowerCase() === st.toLowerCase())
            );
          });

      // Remove questões sem comentário disponível
      const filtered = byTheme.filter(hasUsableExplanation);

      // Separate: due/new vs future
      const dueCards: CardItem[] = [];
      const newCards: CardItem[] = [];
      const futureCards: CardItem[] = [];

      for (const q of filtered) {
        const state = fcMap.get(q.id) ?? null;
        if (!state) {
          newCards.push({ question: q, state: null });
        } else if (tsToMs(state.nextReview) <= now) {
          dueCards.push({ question: q, state });
        } else {
          futureCards.push({ question: q, state });
        }
      }

      // Shuffle each group
      const shuffled = (arr: CardItem[]) => {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      };

      // Priority: due > new > future
      const session = [
        ...shuffled(dueCards),
        ...shuffled(newCards),
        ...shuffled(futureCards),
      ].slice(0, MAX_CARDS);

      if (session.length === 0) {
        setErrMsg("Nenhuma questão encontrada para os temas selecionados.");
        setPhase("error");
        return;
      }

      setCards(session);
      setIndex(0);
      setFlipped(false);
      setSessionResults([]);
      setPhase("studying");
    } catch (err) {
      console.error(err);
      setErrMsg(err instanceof Error ? err.message : "Falha ao carregar flashcards.");
      setPhase("error");
    }
  }, [selectedTemas]);

  useEffect(() => { void load(); }, [load]);

  // ── Rate card ─────────────────────────────────────────────────────────────
  async function rate(rating: Rating) {
    const u = auth.currentUser;
    if (!u || !cards[index]) return;

    const card = cards[index];
    const qid = card.question.id;
    const currentState = card.state;
    const currentBox = currentState?.box ?? 0;
    const newBox = getNextBox(currentBox, rating);
    const nextReviewMs = getNextReviewMs(newBox);

    // Save to Firestore (non-blocking)
    const fcRef = doc(db, "users", u.uid, "flashcards", qid);
    void setDoc(fcRef, {
      box: newBox,
      nextReview: nextReviewMs,
      lastReviewed: Date.now(),
      updatedAt: serverTimestamp(),
      totalSeen: (currentState?.totalSeen ?? 0) + 1,
      totalKnew: (currentState?.totalKnew ?? 0) + (rating === "knew" ? 1 : 0),
    }, { merge: true });

    setSessionResults((prev) => [...prev, { rating, questionId: qid }]);

    if (index + 1 >= cards.length) {
      // Registra flashcards concluídos hoje (contagem da sessão inteira)
      void recordFlashcardSession(u.uid, index + 1);
      setPhase("done");
    } else {
      setIndex((i) => i + 1);
      setFlipped(false);
    }
  }

  // ── Render: loading ───────────────────────────────────────────────────────
  if (phase === "loading") {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <div className="h-14 w-14 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
        <div className="h-4 w-48 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
        <div className="text-sm text-slate-500 dark:text-slate-400">Carregando flashcards…</div>
      </div>
    );
  }

  // ── Render: error ─────────────────────────────────────────────────────────
  if (phase === "error") {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 dark:bg-rose-950/40">
          <Brain size={28} className="text-rose-400" />
        </div>
        <div className="text-lg font-black text-slate-900 dark:text-slate-100">Ops!</div>
        <div className="text-sm text-slate-500 dark:text-slate-400">{errMsg}</div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => router.push("/aluno/flashcards")} className="gap-2">
            <ChevronLeft size={14} />
            Voltar
          </Button>
          <Button onClick={load} className="gap-2">
            <RotateCcw size={14} />
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  // ── Render: done ──────────────────────────────────────────────────────────
  if (phase === "done") {
    const knew = sessionResults.filter((r) => r.rating === "knew").length;
    const almost = sessionResults.filter((r) => r.rating === "almost").length;
    const didntKnow = sessionResults.filter((r) => r.rating === "didnt_know").length;
    const total = sessionResults.length;
    const pct = total > 0 ? Math.round((knew / total) * 100) : 0;

    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-500 to-blue-500 shadow-[0_20px_50px_rgba(99,102,241,0.4)]">
          <Trophy size={36} className="text-white" />
        </div>

        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-500">Sessão concluída</div>
          <div className="mt-1 text-3xl font-black text-slate-900 dark:text-slate-100">
            {pct >= 70 ? "Ótimo trabalho! 🎉" : pct >= 40 ? "Continue assim!" : "Pratique mais!"}
          </div>
          <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Você revisou {total} card{total !== 1 ? "s" : ""} nessa sessão.
          </div>
        </div>

        {/* Result pills */}
        <div className="flex flex-wrap justify-center gap-3">
          <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900/40 dark:bg-emerald-950/30">
            <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />
            <div>
              <div className="text-lg font-black text-emerald-700 dark:text-emerald-300">{knew}</div>
              <div className="text-[11px] font-bold text-emerald-600/70 dark:text-emerald-400/70">Sabia</div>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/30">
            <Minus size={16} className="text-amber-600 dark:text-amber-400" />
            <div>
              <div className="text-lg font-black text-amber-700 dark:text-amber-300">{almost}</div>
              <div className="text-[11px] font-bold text-amber-600/70 dark:text-amber-400/70">Quase</div>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 dark:border-rose-900/40 dark:bg-rose-950/30">
            <XCircle size={16} className="text-rose-500 dark:text-rose-400" />
            <div>
              <div className="text-lg font-black text-rose-600 dark:text-rose-400">{didntKnow}</div>
              <div className="text-[11px] font-bold text-rose-500/70 dark:text-rose-400/70">Não sabia</div>
            </div>
          </div>
        </div>

        {/* Score ring */}
        <div className="rounded-2xl border border-slate-200 bg-white px-8 py-4 dark:border-slate-800 dark:bg-slate-900/60">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-500">Taxa de acerto</div>
          <div className={cn(
            "mt-1 text-4xl font-black",
            pct >= 70 ? "text-emerald-600 dark:text-emerald-400" :
            pct >= 40 ? "text-amber-600 dark:text-amber-400" :
            "text-rose-500 dark:text-rose-400"
          )}>
            {pct}%
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={load} className="gap-2">
            <RotateCcw size={14} />
            Estudar mais
          </Button>
          <Button variant="secondary" onClick={() => router.push("/aluno/flashcards")} className="gap-2">
            <Layers size={14} />
            Voltar ao início
          </Button>
        </div>
      </div>
    );
  }

  // ── Render: studying ──────────────────────────────────────────────────────
  const card = cards[index];
  if (!card) return null;

  const { question, state } = card;
  const statement = getStatement(question);
  const statementHtml = toHtml(statement);
  const correctOption = getCorrectOption(question);
  const explanation = getExplanation(question);
  const explanationHtml = toHtml(explanation);
  const themes = extractThemes(question);
  const progress = ((index) / cards.length) * 100;
  const isNew = state === null;
  const box = state?.box ?? 0;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">

      {/* Top bar */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/aluno/flashcards")}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          <ChevronLeft size={16} />
        </button>

        <div className="flex-1">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span className="font-semibold">{index + 1} / {cards.length}</span>
            <span className="font-semibold">{Math.round(progress)}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-blue-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Box badge */}
        <div className={cn(
          "shrink-0 rounded-xl border px-2.5 py-1 text-[11px] font-bold",
          isNew
            ? "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
            : box >= 4
            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300"
            : "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900/40 dark:bg-indigo-950/30 dark:text-indigo-300"
        )}>
          {isNew ? "Novo" : `Caixa ${box}`}
        </div>
      </div>

      {/* ── CARD ──────────────────────────────────────────────────────── */}
      <style>{`
        @keyframes fc-flip-in {
          0%   { opacity: 0; transform: rotateY(-12deg) scale(0.985); }
          100% { opacity: 1; transform: rotateY(0deg) scale(1); }
        }
      `}</style>
      <div style={{ perspective: "1200px" }}>
        <div
          key={flipped ? "back" : "front"}
          style={{ animation: "fc-flip-in 0.4s cubic-bezier(0.4, 0, 0.2, 1) both" }}
          className="w-full rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800/80 dark:bg-slate-900/60"
        >
          {!flipped ? (
            /* ── Front: enunciado + alternativas sem gabarito ── */
            <>
              {/* Tags */}
              <div className="mb-4 flex flex-wrap gap-1.5">
                {themes.slice(0, 3).map((t) => (
                  <span key={t} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {t}
                  </span>
                ))}
              </div>

              {/* Enunciado */}
              {statementHtml ? (
                <div
                  className="text-[15px] leading-7 text-slate-900 dark:text-slate-100 [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:underline"
                  dangerouslySetInnerHTML={{ __html: statementHtml }}
                />
              ) : (
                <div className="text-sm italic text-slate-400">Sem enunciado disponível.</div>
              )}

              {/* Imagem */}
              {question.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={question.imageUrl} alt="Imagem da questão" className="mt-4 max-h-48 rounded-xl object-contain" />
              )}

              {/* Alternativas — exibidas sem destaque para o aluno pensar */}
              {question.options && question.options.length > 0 && (
                <div className="mt-4 space-y-2">
                  {question.options.map((opt) => (
                    <div
                      key={opt.id}
                      className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800/50"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-300 text-[11px] font-black text-white dark:bg-slate-600">
                        {safeStr(opt.id).toUpperCase()}
                      </span>
                      <span className="text-sm text-slate-700 dark:text-slate-300">{safeStr(opt.text) || "—"}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Botão ver resposta */}
              <div className="mt-6 flex justify-center">
                <button
                  onClick={() => setFlipped(true)}
                  className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  <Eye size={15} />
                  Ver resposta
                </button>
              </div>
            </>
          ) : (
            /* ── Back: alternativas com gabarito + comentário + avaliação ── */
            <>
              {/* Alternativas com gabarito destacado */}
              <div className="mb-4 space-y-2">
                {question.options && question.options.length > 0 ? (
                  question.options.map((opt) => {
                    const oid = safeStr(opt.id).toUpperCase();
                    const isCorrect = oid === (correctOption.label || "").toUpperCase();
                    return (
                      <div
                        key={oid}
                        className={cn(
                          "flex items-start gap-2.5 rounded-xl border px-3 py-2.5",
                          isCorrect
                            ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/30"
                            : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
                        )}
                      >
                        <span className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-black text-white",
                          isCorrect ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"
                        )}>
                          {oid}
                        </span>
                        <span className={cn(
                          "text-sm",
                          isCorrect
                            ? "font-semibold text-emerald-800 dark:text-emerald-200"
                            : "text-slate-600 dark:text-slate-400"
                        )}>
                          {safeStr(opt.text) || "—"}
                        </span>
                        {isCorrect && <CheckCircle2 size={15} className="ml-auto mt-0.5 shrink-0 text-emerald-500" />}
                      </div>
                    );
                  })
                ) : (
                  /* Sem alternativas: mostra só o label da resposta correta */
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900/40 dark:bg-emerald-950/30">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400 mb-1">
                      Resposta correta
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-xs font-black text-white">
                        {correctOption.label || "?"}
                      </span>
                      <div className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                        {correctOption.text || <span className="italic opacity-60">—</span>}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Comentário */}
              {explanationHtml && (
                <div className="mb-4">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1.5">
                    Comentário
                  </div>
                  <div
                    className="text-sm leading-6 text-slate-700 dark:text-slate-300 [&_p]:my-1 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:underline"
                    dangerouslySetInnerHTML={{ __html: explanationHtml }}
                  />
                </div>
              )}

              {/* Botões de avaliação */}
              <div className="mt-5 grid grid-cols-3 gap-2">
                <button
                  onClick={() => void rate("didnt_know")}
                  className="flex flex-col items-center gap-1.5 rounded-2xl border border-rose-200 bg-rose-50 px-1.5 py-3 text-center transition hover:bg-rose-100 sm:px-3 dark:border-rose-900/40 dark:bg-rose-950/30 dark:hover:bg-rose-950/50"
                >
                  <XCircle size={20} className="text-rose-500 dark:text-rose-400" />
                  <span className="text-[11px] font-bold text-rose-700 sm:text-xs dark:text-rose-300">Não sabia</span>
                  <span className="text-[10px] text-rose-500/70 dark:text-rose-400/60">amanhã</span>
                </button>

                <button
                  onClick={() => void rate("almost")}
                  className="flex flex-col items-center gap-1.5 rounded-2xl border border-amber-200 bg-amber-50 px-1.5 py-3 text-center transition hover:bg-amber-100 sm:px-3 dark:border-amber-900/40 dark:bg-amber-950/30 dark:hover:bg-amber-950/50"
                >
                  <Minus size={20} className="text-amber-600 dark:text-amber-400" />
                  <span className="text-[11px] font-bold text-amber-700 sm:text-xs dark:text-amber-300">Quase</span>
                  <span className="text-[10px] text-amber-600/70 dark:text-amber-400/60">+1 dia</span>
                </button>

                <button
                  onClick={() => void rate("knew")}
                  className="flex flex-col items-center gap-1.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-1.5 py-3 text-center transition hover:bg-emerald-100 sm:px-3 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:hover:bg-emerald-950/50"
                >
                  <CheckCircle2 size={20} className="text-emerald-600 dark:text-emerald-400" />
                  <span className="text-[11px] font-bold text-emerald-700 sm:text-xs dark:text-emerald-300">Sabia</span>
                  <span className="text-[10px] text-emerald-600/70 dark:text-emerald-400/60">
                    +{BOX_DAYS[Math.min((state?.box ?? 0) + 1, 5)]}d
                  </span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Keyboard hint */}
      <div className="text-center text-xs text-slate-400 dark:text-slate-600">
        {!flipped
          ? "Clique em \"Ver resposta\" quando estiver pronto"
          : "Avalie seu desempenho para prosseguir"}
      </div>
    </div>
  );
}
