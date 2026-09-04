"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { shuffledOptions, optionLabel } from "@/lib/shuffledOptions";
import { auth, db } from "@/lib/firebase";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  increment,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { recordAnswer } from "@/lib/study-tracking";
import { usePlano, useQuestoesHoje, LIMITES_GRATIS } from "@/lib/plano";
import { AvisoLimitePlano } from "@/components/aluno/UpsellPlano";
import { usePageHeader } from "@/components/aluno/AlunoPageHeaderContext";
import { ChevronLeft, ChevronRight, CheckCircle2, XCircle, AlertCircle, Flag } from "lucide-react";
import { SkeletonCard } from "@/components/ui/skeleton";

type SessionDoc = {
  timeSpentMs?: number;
  id: string;
  status?: "in_progress" | "completed";
  questionIds?: unknown;
  optionMap?: Record<string, string[]>;
  totalQuestions?: number;
  currentIndex?: number;
  answeredCount?: number;
  correctCount?: number;
  scorePercent?: number;
  answersMap?: Record<string, AnswerMapItem>;
  updatedAt?: unknown;
  title?: string;
  titleDisplay?: string;
};

type AnswerMapItem = {
  selectedOptionId?: string;
  isCorrect?: boolean;
  answeredAt?: unknown;
};

type QuestionOption = { id: string; text?: string; imageUrl?: string | null };

type QuestionDoc = {
  id: string;

  // enunciado
  prompt?: string;
  pergunta?: string;
  enunciado?: string;
  statement?: string;
  title?: string;
  text?: string;
  question?: string;

  // alternativas
  options?: QuestionOption[];

  // gabarito
  correctOptionId?: string;
  correctOption?: string;
  correct?: string;
  gabarito?: string;

  // comentário
  explanation?: unknown;
  comentario?: unknown;
  comment?: unknown;
  referencia?: unknown;
  referenca?: unknown;
  reference?: unknown;
  fonte?: unknown;
  bibliografia?: unknown;

  imageUrl?: string | null;
};

type LegacyQuestionDoc = {
  questionId?: unknown;
  questionsBankId?: unknown;
  bankId?: unknown;
  qid?: unknown;
  refId?: unknown;
};

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function escapeHtml(raw: string) {
  return raw
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const ALLOWED_RICH_TAGS = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "sub",
  "sup",
  "span",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "code",
  "pre",
  "a",
]);

function sanitizeRichText(raw: string) {
  const input = String(raw || "");
  if (!input) return "";

  if (typeof window === "undefined") {
    return escapeHtml(input).replaceAll("\n", "<br />");
  }

  const parser = new window.DOMParser();
  const doc = parser.parseFromString(input, "text/html");

  doc.querySelectorAll("script,style,iframe,object,embed,link,meta").forEach((node) => node.remove());

  const elements = Array.from(doc.body.querySelectorAll("*"));
  elements.forEach((el) => {
    const tag = el.tagName.toLowerCase();

    if (!ALLOWED_RICH_TAGS.has(tag)) {
      const fragment = doc.createDocumentFragment();
      while (el.firstChild) fragment.appendChild(el.firstChild);
      el.replaceWith(fragment);
      return;
    }

    const attrs = Array.from(el.attributes);
    attrs.forEach((attr) => {
      const name = attr.name.toLowerCase();
      const value = attr.value;

      if (name.startsWith("on") || name === "style") {
        el.removeAttribute(attr.name);
        return;
      }

      if (tag === "a" && name === "href") {
        const href = value.trim().toLowerCase();
        const isSafeHref =
          href.startsWith("http://") ||
          href.startsWith("https://") ||
          href.startsWith("mailto:") ||
          href.startsWith("tel:");
        if (!isSafeHref) {
          el.removeAttribute("href");
        } else {
          el.setAttribute("target", "_blank");
          el.setAttribute("rel", "noopener noreferrer");
        }
        return;
      }

      if (tag === "a" && (name === "target" || name === "rel")) return;
      if (name !== "href") el.removeAttribute(attr.name);
    });
  });

  return doc.body.innerHTML;
}

/**
 * Remove parágrafos vazios excessivos, <li> vazios e mescla listas adjacentes
 * do mesmo tipo. Não altera formatação (negrito, itálico, etc.).
 */
function normalizeHtml(html: string): string {
  if (!html || typeof window === "undefined") return html;
  const parser = new window.DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // Remove <li> sem conteúdo
  doc.querySelectorAll("li").forEach((li) => {
    if (!(li.textContent ?? "").trim() && !li.querySelector("img")) li.remove();
  });

  // Mescla listas adjacentes do mesmo tipo separadas por parágrafos vazios
  Array.from(doc.body.children).forEach((el) => {
    const tag = el.tagName;
    if (tag !== "UL" && tag !== "OL") return;
    let next = el.nextElementSibling;
    while (next && next.tagName === "P" && !(next.textContent ?? "").trim()) {
      const toRemove = next;
      next = next.nextElementSibling;
      toRemove.remove();
    }
    if (next && next.tagName === tag) {
      while (next.firstChild) el.appendChild(next.firstChild);
      next.remove();
    }
  });

  // Colapsa parágrafos vazios consecutivos: máximo 1 seguido
  let emptyRun = 0;
  Array.from(doc.body.children).forEach((child) => {
    const isEmpty =
      child.tagName === "P" &&
      !(child.textContent ?? "").trim() &&
      !child.querySelector("img");
    if (isEmpty) {
      emptyRun++;
      if (emptyRun > 1) child.remove();
    } else {
      emptyRun = 0;
    }
  });

  // Remove parágrafos vazios no início e fim
  while (
    doc.body.firstElementChild?.tagName === "P" &&
    !(doc.body.firstElementChild.textContent ?? "").trim()
  ) doc.body.firstElementChild.remove();
  while (
    doc.body.lastElementChild?.tagName === "P" &&
    !(doc.body.lastElementChild.textContent ?? "").trim()
  ) doc.body.lastElementChild.remove();

  return doc.body.innerHTML;
}

function safeStr(v: unknown) {
  return String(v ?? "").trim();
}

function optionRank(id: unknown) {
  const key = safeStr(id).toUpperCase();
  if (key === "A") return 0;
  if (key === "B") return 1;
  if (key === "C") return 2;
  if (key === "D") return 3;
  if (key === "E") return 4;

  const numeric = Number(key);
  if (Number.isFinite(numeric)) return 100 + numeric;
  return 999;
}

function sortOptionsById(options: QuestionOption[] | undefined) {
  if (!Array.isArray(options) || options.length <= 1) return options ?? [];

  return [...options].sort((a, b) => {
    const rankDiff = optionRank(a.id) - optionRank(b.id);
    if (rankDiff !== 0) return rankDiff;
    return safeStr(a.id).localeCompare(safeStr(b.id), "pt-BR", { sensitivity: "base" });
  });
}

/**
 * ✅ session.questionIds pode vir:
 * - string[]
 * - [{id:"q_0001"}]
 * - qualquer coisa
 */
function normalizeIdList(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) {
    return v
      .map((x) => {
        if (typeof x === "string") return x;
        if (x && typeof x === "object") {
          const item = x as { id?: unknown; questionId?: unknown; questionsBankId?: unknown };
          return item.id || item.questionId || item.questionsBankId || "";
        }
        return "";
      })
      .map((s) => safeStr(s))
      .filter(Boolean);
  }
  return [];
}

/**
 * ✅ Resolve IDs antigos:
 * 1) tenta direto em questionsBank/{id}
 * 2) tenta em questoes/{id} e extrai questionId -> q_0001
 * 3) tenta alguns campos alternativos
 */
async function resolveQuestionsBankId(maybeId: string): Promise<string> {
  const raw = safeStr(maybeId);
  if (!raw) throw new Error("ID de questão vazio.");

  // 1) tenta direto
  const bankRef = doc(db, "questionsBank", raw);
  const bankSnap = await getDoc(bankRef);
  if (bankSnap.exists()) return raw;

  // 2) tenta coleção "questoes"
  const legacyRef = doc(db, "questoes", raw);
  const legacySnap = await getDoc(legacyRef);
  if (legacySnap.exists()) {
    const data = legacySnap.data() as LegacyQuestionDoc;

    const qid =
      data?.questionId ||
      data?.questionsBankId ||
      data?.bankId ||
      data?.qid ||
      data?.refId ||
      "";

    const normalized = safeStr(qid);
    if (!normalized) {
      throw new Error(
        `Questão não encontrada (${raw}). Doc existe em "questoes", mas sem questionId.`
      );
    }

    // valida se existe no bank
    const bankRef2 = doc(db, "questionsBank", normalized);
    const bankSnap2 = await getDoc(bankRef2);
    if (bankSnap2.exists()) return normalized;

    throw new Error(`Questão não encontrada (${raw}). questionId "${normalized}" não existe no questionsBank.`);
  }

  throw new Error(`Questão não encontrada (${raw}).`);
}

async function getQuestionById(questionIdInput: string): Promise<QuestionDoc> {
  const resolvedId = await resolveQuestionsBankId(questionIdInput);
  const ref = doc(db, "questionsBank", resolvedId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error(`Questão não encontrada (${questionIdInput}).`);
  return { id: snap.id, ...(snap.data() as Omit<QuestionDoc, "id">) };
}

export default function QuizClient({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const { setHeader, clearHeader } = usePageHeader();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [session, setSession] = useState<SessionDoc | null>(null);

  const [questions, setQuestions] = useState<QuestionDoc[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);

  // Plano gratuito: 10 questões respondidas por dia
  const plano = usePlano();
  const questoesHoje = useQuestoesHoje();
  const limiteDiarioAtingido =
    plano.gratuito && questoesHoje != null && questoesHoje >= LIMITES_GRATIS.questoesPorDia;

  // Cronômetro — tempo total do simulado (persistido em timeSpentMs)
  const [clockMs, setClockMs] = useState(0);
  const clockBaseRef = useRef(0);
  const segStartRef = useRef(Date.now());

  // reportar erro
  const [reportOpen, setReportOpen] = useState(false);
  const [reportText, setReportText] = useState("");
  const [reportSending, setReportSending] = useState(false);
  const [reportNotice, setReportNotice] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const isReviewMode = session?.status === "completed";
  const shouldShowFeedback = confirmed || isSubmitting || isReviewMode;

  const isFirst = currentIndex <= 0;

  const totalFromSession = useMemo(() => {
    const tq = Number(session?.totalQuestions ?? 0) || 0;
    const ql = normalizeIdList(session?.questionIds).length;
    return Math.max(tq, ql, questions.length);
  }, [session, questions.length]);

  const isLast = useMemo(() => {
    const total = totalFromSession || questions.length || 0;
    return total > 0 ? currentIndex >= total - 1 : false;
  }, [currentIndex, totalFromSession, questions.length]);

  const currentQuestion = useMemo(() => questions[currentIndex] ?? null, [questions, currentIndex]);

  // Atualiza header com título e progresso do simulado
  useEffect(() => {
    if (!session) return;
    const total = totalFromSession || questions.length || 0;
    const sessionTitle = session.titleDisplay || session.title || "Simulado";
    const modeLabel = isReviewMode ? "Revisão" : "Questão";
    setHeader({
      title: sessionTitle,
      subtitle: total > 0 ? `${modeLabel} ${currentIndex + 1} de ${total}` : modeLabel,
    });
  }, [session, currentIndex, totalFromSession, questions.length, isReviewMode, setHeader]);

  useEffect(() => {
    return () => clearHeader();
  }, [clearHeader]);

  useEffect(() => {
    if (!session) return;
    clockBaseRef.current = Number(session.timeSpentMs ?? 0);
    segStartRef.current = Date.now();
    setClockMs(clockBaseRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  useEffect(() => {
    if (isReviewMode) return;
    const t = setInterval(() => {
      setClockMs(clockBaseRef.current + (Date.now() - segStartRef.current));
    }, 1000);
    return () => clearInterval(t);
  }, [isReviewMode]);

  const flushClock = useCallback(() => {
    if (isReviewMode) return;
    const u = auth.currentUser;
    if (!u) return;
    const delta = Date.now() - segStartRef.current;
    if (delta < 500) return;
    segStartRef.current = Date.now();
    clockBaseRef.current += delta;
    updateDoc(doc(db, "users", u.uid, "sessions", sessionId), {
      timeSpentMs: increment(delta),
    }).catch(() => { /* cronômetro é best-effort */ });
  }, [isReviewMode, sessionId]);
  const currentSavedAnswer = useMemo(() => {
    if (!session || !currentQuestion) return null;
    const saved = session.answersMap?.[currentQuestion.id];
    return saved && typeof saved === "object" ? saved : null;
  }, [session, currentQuestion]);

  const statement = useMemo(() => {
    return (
      currentQuestion?.pergunta ||
      currentQuestion?.enunciado ||
      currentQuestion?.statement ||
      currentQuestion?.prompt ||
      currentQuestion?.question ||
      currentQuestion?.text ||
      currentQuestion?.title ||
      "Pergunta não encontrada"
    );
  }, [currentQuestion]);
  const statementHtml = useMemo(() => normalizeHtml(sanitizeRichText(safeStr(statement))), [statement]);

  const correctId = useMemo(() => {
    return (
      currentQuestion?.correctOptionId ||
      currentQuestion?.correctOption ||
      currentQuestion?.correct ||
      currentQuestion?.gabarito ||
      null
    );
  }, [currentQuestion]);

  // Letra EXIBIDA da alternativa correta (posição no embaralhamento da tela,
  // não o id original do caderno).
  const correctLabel = useMemo(() => {
    if (!correctId) return null;
    const idx = (currentQuestion?.options ?? []).findIndex(
      (o) => safeStr(o?.id) === safeStr(correctId)
    );
    return idx >= 0 ? optionLabel(idx) : null;
  }, [correctId, currentQuestion]);

  const explanationText = useMemo(() => {
    const raw =
      currentQuestion?.explanation ??
      currentQuestion?.comentario ??
      currentQuestion?.comment ??
      "";

    const s = safeStr(raw);

    // se vier "Resposta: X Comentário: Y", mantém tudo
    return s;
  }, [currentQuestion]);
  const explanationHtml = useMemo(() => normalizeHtml(sanitizeRichText(explanationText)), [explanationText]);

  const referenceText = useMemo(() => {
    const raw =
      currentQuestion?.referencia ??
      currentQuestion?.referenca ??
      currentQuestion?.reference ??
      currentQuestion?.fonte ??
      currentQuestion?.bibliografia ??
      "";
    return safeStr(raw);
  }, [currentQuestion]);
  const referenceHtml = useMemo(() => sanitizeRichText(referenceText), [referenceText]);

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
      const sessionRef = doc(db, "users", u.uid, "sessions", sessionId);
      const snap = await getDoc(sessionRef);
      if (!snap.exists()) throw new Error("Sessão não encontrada.");

      const sess: SessionDoc = { id: snap.id, ...(snap.data() as Omit<SessionDoc, "id">) };

      const questionIds = normalizeIdList(sess.questionIds);
      if (!questionIds.length) {
        throw new Error("Nenhuma questão foi carregada. (questionIds vazio na session)");
      }

      // ✅ carrega robusto
      const loaded = await Promise.all(questionIds.map((qid) => getQuestionById(qid)));

      // mantém ordem
      const ordered = questionIds
        .map((qid) => {
          const question = loaded.find((q) => q.id === qid) || loaded[0] || null;
          if (!question) return null;

          return {
            ...question,
            // Ordem embaralhada por sessão (determinística): impede decorar a
            // posição da resposta sem quebrar o histórico, que usa o id original.
            options: shuffledOptions(sortOptionsById(question.options), `${sessionId}:${qid}`),
          };
        })
        .filter(Boolean) as QuestionDoc[];

      setSession(sess);
      setQuestions(ordered);

      const idx = Number(sess.currentIndex ?? 0) || 0;
      const nextIndex =
        sess.status === "completed"
          ? 0
          : Math.min(Math.max(0, idx), Math.max(0, ordered.length - 1));

      setCurrentIndex(nextIndex);

      if (sess.status === "completed" && idx !== 0) {
        await updateDoc(sessionRef, {
          currentIndex: 0,
          updatedAt: serverTimestamp(),
        });
      }

    } catch (error: unknown) {
      console.error(error);
      setErr(getErrorMessage(error, "Falha ao carregar simulado."));
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setReportOpen(false);
    setReportText("");
    setReportNotice(null);

    if (!currentQuestion) {
      setSelectedOptionId(null);
      setConfirmed(false);
      setIsCorrect(null);
      return;
    }

    if (currentSavedAnswer) {
      const savedOptionId = safeStr(currentSavedAnswer.selectedOptionId);
      setSelectedOptionId(savedOptionId || null);
      setConfirmed(true);
      setIsCorrect(Boolean(currentSavedAnswer.isCorrect));
      return;
    }

    setSelectedOptionId(null);
    setConfirmed(false);
    setIsCorrect(null);
  }, [currentQuestion, currentSavedAnswer]);

  async function persistIndex(nextIndex: number) {
    const u = auth.currentUser;
    if (!u) return;
    flushClock();

    try {
      await updateDoc(doc(db, "users", u.uid, "sessions", sessionId), {
        currentIndex: nextIndex,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Falha ao persistir índice da sessão:", error);
    }
  }

  async function onConfirm() {
    if (!session || !currentQuestion || !selectedOptionId || isReviewMode) return;
    if (limiteDiarioAtingido) return;

    const u = auth.currentUser;
    if (!u) return;

    setIsSubmitting(true);

    try {
      const chosen = safeStr(selectedOptionId);
      const correct = safeStr(correctId);

      const sessionRef = doc(db, "users", u.uid, "sessions", sessionId);
      const result = await runTransaction(db, async (tx) => {
        const snap = await tx.get(sessionRef);
        if (!snap.exists()) throw new Error("Sessão não encontrada.");

        const persisted = snap.data() as SessionDoc;
        const existingAnswer = persisted.answersMap?.[currentQuestion.id];
        if (existingAnswer && typeof existingAnswer === "object") {
          return {
            alreadyAnswered: true,
            selectedOptionId: safeStr(existingAnswer.selectedOptionId),
            isCorrect: Boolean(existingAnswer.isCorrect),
            answeredCount: Number(persisted.answeredCount ?? 0),
            correctCount: Number(persisted.correctCount ?? 0),
            scorePercent: Number(persisted.scorePercent ?? 0),
          };
        }

        const ok = !!(correct && chosen && correct === chosen);
        const nextAnsweredCount = Number(persisted.answeredCount ?? 0) + 1;
        const nextCorrectCount = Number(persisted.correctCount ?? 0) + (ok ? 1 : 0);
        const total =
          Number(persisted.totalQuestions ?? normalizeIdList(persisted.questionIds).length ?? 0) ||
          questions.length ||
          0;
        const scorePercent = total > 0 ? Math.round((nextCorrectCount / total) * 100) : 0;

        tx.update(sessionRef, {
          answeredCount: nextAnsweredCount,
          correctCount: nextCorrectCount,
          scorePercent,
          updatedAt: serverTimestamp(),
          [`answersMap.${currentQuestion.id}`]: {
            selectedOptionId: chosen,
            isCorrect: ok,
            answeredAt: serverTimestamp(),
          },
        });

        return {
          alreadyAnswered: false,
          selectedOptionId: chosen,
          isCorrect: ok,
          answeredCount: nextAnsweredCount,
          correctCount: nextCorrectCount,
          scorePercent,
        };
      });

      // Acompanhamento de estudo (stats + caderno de erros) — só em resposta nova.
      if (!result.alreadyAnswered) {
        void recordAnswer({
          uid: u.uid,
          question: currentQuestion as unknown as Record<string, unknown> & { id: string },
          isCorrect: result.isCorrect,
          selectedOptionId: result.selectedOptionId || null,
          correctOptionId: correct || null,
        });
      }

      setSession((prev) =>
        prev
          ? {
              ...prev,
              answeredCount: result.answeredCount,
              correctCount: result.correctCount,
              scorePercent: result.scorePercent,
              answersMap: {
                ...(prev.answersMap ?? {}),
                [currentQuestion.id]: {
                  selectedOptionId: result.selectedOptionId,
                  isCorrect: result.isCorrect,
                  answeredAt: new Date(),
                },
              },
            }
          : prev
      );

      setConfirmed(true);
      setSelectedOptionId(result.selectedOptionId || null);
      setIsCorrect(result.isCorrect);
      flushClock();
    } catch (e) {
      console.error(e);
      setErr("Não foi possível confirmar sua resposta.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function onPrev() {
    if (isFirst) return;
    const next = currentIndex - 1;
    setCurrentIndex(next);
    persistIndex(next);

    setSelectedOptionId(null);
    setConfirmed(false);
    setIsCorrect(null);
    setReportOpen(false);
    setReportText("");
    setReportNotice(null);
  }

  function onNext() {
    if (isLast) return;
    const next = currentIndex + 1;
    setCurrentIndex(next);
    persistIndex(next);

    setSelectedOptionId(null);
    setConfirmed(false);
    setIsCorrect(null);
    setReportOpen(false);
    setReportText("");
    setReportNotice(null);
  }

  async function onFinish() {
    const u = auth.currentUser;
    if (!u || !session) return;

    setIsFinishing(true);
    try {
      flushClock();
      await updateDoc(doc(db, "users", u.uid, "sessions", sessionId), {
        status: "completed",
        updatedAt: serverTimestamp(),
      });

      router.push(`/aluno/simulados/${sessionId}/resultado`);
    } catch (e) {
      console.error(e);
      setErr("Não foi possível finalizar o simulado.");
    } finally {
      setIsFinishing(false);
    }
  }

  async function onSendReport() {
    const u = auth.currentUser;
    if (!u || !currentQuestion) return;

    const msg = safeStr(reportText);
    if (!msg) return;

    setReportSending(true);
    setReportNotice(null);
    try {
      await addDoc(collection(db, "erros_reportados"), {
        createdAt: serverTimestamp(),
        status: "open",
        userId: u.uid,
        userEmail: u.email ?? null,
        sessionId,
        questionId: currentQuestion.id, // ✅ id do questionsBank
        selectedOptionId: selectedOptionId ?? null,
        correctOptionId: correctId ?? null,
        message: msg,
        origin: "web-aluno",
      });

      setReportOpen(false);
      setReportText("");
      setReportNotice({
        type: "success",
        text: "Erro reportado com sucesso. Obrigado pelo feedback.",
      });
    } catch (e) {
      console.error(e);
      setReportNotice({
        type: "error",
        text: "Não foi possível reportar agora. Tente novamente em instantes.",
      });
    } finally {
      setReportSending(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <SkeletonCard lines={4} />
        <SkeletonCard lines={2} />
        <SkeletonCard lines={2} />
        <SkeletonCard lines={2} />
      </div>
    );
  }

  if (err) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-5 dark:border-red-900/40 dark:bg-red-950/30">
        <div className="flex items-start gap-3">
          <AlertCircle size={20} className="mt-0.5 shrink-0 text-red-500" />
          <div>
            <div className="font-bold text-red-800 dark:text-red-200">Erro ao carregar</div>
            <div className="mt-1 text-sm text-red-700 dark:text-red-300">{err}</div>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" onClick={() => router.push("/aluno/simulados")}>Voltar</Button>
          <Button onClick={load}>Tentar novamente</Button>
        </div>
      </div>
    );
  }

  if (!session || !currentQuestion) return null;

  const canFinalize = !isReviewMode && isLast;
  const finalizeDisabled = !confirmed || isSubmitting || isFinishing;
  const hasSavedAnswer = !!currentSavedAnswer && !!safeStr(currentSavedAnswer.selectedOptionId);
  const showResultPanel = confirmed || isReviewMode;
  const progressPct = totalFromSession > 0 ? Math.round(((currentIndex + 1) / totalFromSession) * 100) : 0;
  const questionIdList = normalizeIdList(session.questionIds);
  const answeredSet = new Set(
    Object.entries(session.answersMap ?? {})
      .filter(([, v]) => v && typeof v === "object" && safeStr((v as AnswerMapItem).selectedOptionId))
      .map(([k]) => k)
  );

  function jumpTo(index: number) {
    if (index === currentIndex || index < 0) return;
    setCurrentIndex(index);
    void persistIndex(index);
    setSelectedOptionId(null);
    setConfirmed(false);
    setIsCorrect(null);
    setReportOpen(false);
    setReportText("");
    setReportNotice(null);
  }

  const provaBadge = safeStr((currentQuestion as { examSource?: unknown }).examSource).replace(/[()]/g, "").replace("-", " ");

  const clockLabel = (() => {
    const totalS = Math.floor(clockMs / 1000);
    const h = Math.floor(totalS / 3600);
    const m = Math.floor((totalS % 3600) / 60);
    const sec = totalS % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
  })();

  // Matéria da questão: disciplina > primeiro assunto > área (nome curto)
  const materiaBadge = (() => {
    const q = currentQuestion as {
      disciplina?: unknown;
      assuntos?: unknown;
      themes?: unknown;
      area?: unknown;
    };
    const disciplina = safeStr(q.disciplina);
    if (disciplina) return disciplina;
    const assuntos = Array.isArray(q.assuntos) ? q.assuntos : Array.isArray(q.themes) ? q.themes : [];
    const assunto = safeStr(assuntos[0]);
    if (assunto) return assunto;
    const area = safeStr(q.area);
    if (area) return area.split(",")[0].split(" e suas")[0];
    return "";
  })();

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">

      {/* Coluna principal */}
      <div className="min-w-0 flex-1 space-y-4">

        {/* Barra de progresso */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-vinke-ink3">
            <span>
              {isReviewMode ? "Revisão" : "Questão"}{" "}
              <span className="font-display font-bold text-vinke-ink dark:text-white">{currentIndex + 1}</span>
              {" "}de{" "}
              <span className="font-display font-bold text-vinke-ink dark:text-white">{totalFromSession || "—"}</span>
            </span>
            {isReviewMode ? (
              <span className="rounded-full bg-vinke-soft px-2.5 py-0.5 text-[11px] font-bold text-vinke dark:bg-vinke/15 dark:text-vinke-lav">
                Modo revisão
              </span>
            ) : (
              <span className="flex items-center gap-2.5">
                <span className="rounded-[8px] bg-vinke-navy px-2.5 py-1 font-display text-[12px] font-bold text-white [font-variant-numeric:tabular-nums] dark:bg-white dark:text-vinke-navy">
                  {clockLabel}
                </span>
                <span className="font-display font-bold text-vinke-ink dark:text-white">{progressPct}%</span>
              </span>
            )}
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-vinke-line2 dark:bg-vinke-navy-sel">
            <div
              className="h-full rounded-full bg-vinke transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Card da questão */}
        <div className="rounded-2xl bg-white dark:border dark:border-vinke-navy-line dark:bg-vinke-navy-card">

          {/* Enunciado */}
          <div className="border-b border-vinke-line2 px-6 py-5 dark:border-vinke-navy-line">
            {materiaBadge || provaBadge ? (
              <div className="mb-2.5 flex flex-wrap gap-1.5">
                {materiaBadge ? (
                  <span className="rounded-full bg-vinke-soft px-2.5 py-0.5 text-[10px] font-bold text-vinke dark:bg-vinke/15 dark:text-vinke-lav">
                    {materiaBadge}
                  </span>
                ) : null}
                {provaBadge ? (
                  <span className="rounded-full bg-vinke-line2 px-2.5 py-0.5 text-[10px] font-bold text-vinke-ink2 dark:bg-vinke-navy dark:text-slate-300">
                    {provaBadge}
                  </span>
                ) : null}
              </div>
            ) : null}
            <div
              className="text-[15px] leading-7 text-vinke-ink dark:text-slate-100 [&_p]:my-2 [&_img]:max-w-full [&_img]:rounded-xl [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:underline"
              dangerouslySetInnerHTML={{ __html: statementHtml }}
            />
            {currentQuestion.imageUrl ? (
              <img
                src={currentQuestion.imageUrl}
                alt="Imagem da questão"
                className="mt-4 max-h-64 w-auto rounded-xl border border-vinke-line dark:border-vinke-navy-line"
              />
            ) : null}
          </div>

          {/* Alternativas */}
          <div className="space-y-2.5 px-6 py-5">
            {currentQuestion.options?.map((opt, optIndex) => {
              const isSelected = selectedOptionId === opt.id;
              const showResult = shouldShowFeedback && !!correctId;
              const isCorrectOpt = showResult && opt.id === correctId;
              const isWrongOpt = showResult && isSelected && opt.id !== correctId;

              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => !confirmed && !isReviewMode && setSelectedOptionId(opt.id)}
                  disabled={confirmed || isReviewMode}
                  className={cn(
                    "w-full rounded-[10px] border-[1.5px] px-4 py-3 text-left outline-none transition",
                    "focus-visible:ring-[3px] focus-visible:ring-vinke-ring",
                    !confirmed && !isReviewMode && "cursor-pointer",
                    confirmed || isReviewMode ? "cursor-default" : "",
                    isCorrectOpt
                      ? "border-vinke-green bg-vinke-green-soft dark:bg-vinke-green/10"
                      : isWrongOpt
                      ? "border-vinke-red bg-vinke-red-soft dark:bg-vinke-red/10"
                      : isSelected
                      ? "border-vinke bg-vinke-soft dark:bg-vinke/15"
                      : "border-vinke-line bg-white hover:border-vinke-ink4 hover:bg-vinke-offwhite dark:border-vinke-navy-line dark:bg-transparent dark:hover:bg-vinke-navy-sel/50"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition",
                      isCorrectOpt
                        ? "bg-vinke-green text-white"
                        : isWrongOpt
                        ? "bg-vinke-red text-white"
                        : isSelected
                        ? "bg-vinke text-white"
                        : "border-[1.5px] border-vinke-line text-vinke-ink2 dark:border-vinke-navy-line dark:text-slate-400"
                    )}>
                      {isCorrectOpt ? "✓" : isWrongOpt ? "✗" : optionLabel(optIndex)}
                    </div>
                    <div className="min-w-0 pt-0.5">
                      <div
                        className={cn(
                          "text-sm leading-6 [&_p]:my-1 [&_img]:max-w-full [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5",
                          isCorrectOpt
                            ? "font-bold text-vinke-green-text dark:text-vinke-green"
                            : isWrongOpt
                            ? "font-bold text-vinke-red dark:text-vinke-red-dark"
                            : isSelected
                            ? "font-bold text-vinke-ink dark:text-slate-100"
                            : "text-vinke-ink dark:text-slate-100"
                        )}
                        dangerouslySetInnerHTML={{ __html: sanitizeRichText(safeStr(opt.text)) }}
                      />
                      {opt.imageUrl ? (
                        <img src={opt.imageUrl} alt="" className="mt-2 max-h-40 rounded-lg border border-vinke-line dark:border-vinke-navy-line" />
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Feedback de resultado */}
          {showResultPanel && (
            <div className="space-y-3 border-t border-vinke-line2 px-6 py-5 dark:border-vinke-navy-line">
              {hasSavedAnswer ? (
                <div className={cn(
                  "flex items-center gap-3 rounded-[10px] px-4 py-3",
                  isCorrect
                    ? "bg-vinke-green-soft dark:bg-vinke-green/10"
                    : "bg-vinke-red-soft dark:bg-vinke-red/10"
                )}>
                  <span className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-bold text-white",
                    isCorrect ? "bg-vinke-green" : "bg-vinke-red"
                  )}>
                    {isCorrect ? "✓" : "✗"}
                  </span>
                  <div>
                    <div className={cn(
                      "font-display text-sm font-bold",
                      isCorrect ? "text-vinke-green-text dark:text-vinke-green" : "text-vinke-red dark:text-vinke-red-dark"
                    )}>
                      {isCorrect ? "Você acertou!" : "Você errou."}
                    </div>
                    {!isCorrect && correctLabel && (
                      <div className="mt-0.5 text-xs font-semibold text-vinke-ink2 dark:text-slate-300">
                        A resposta correta é a alternativa <strong>{correctLabel}</strong>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-[10px] bg-vinke-line2 px-4 py-3 text-sm text-vinke-ink2 dark:bg-vinke-navy dark:text-slate-300">
                  Questão sem resposta registrada.
                </div>
              )}

              {explanationText ? (
                <div className="rounded-[10px] bg-vinke-offwhite px-5 py-4 dark:bg-vinke-navy">
                  <div className="mb-1.5 text-xs font-bold text-vinke-ink dark:text-slate-100">Resolução comentada</div>
                  <div
                    className="text-sm leading-6 text-vinke-ink2 dark:text-slate-300 [&_p]:my-2 [&_strong]:font-bold [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5"
                    dangerouslySetInnerHTML={{ __html: explanationHtml }}
                  />
                </div>
              ) : null}

              {referenceText ? (
                <div className="text-xs leading-5 text-vinke-ink3 [&_a]:underline"
                  dangerouslySetInnerHTML={{ __html: referenceHtml }}
                />
              ) : null}
            </div>
          )}

          {/* Confirmar */}
          {!showResultPanel && (
            <div className="space-y-3 border-t border-vinke-line2 px-6 py-4 dark:border-vinke-navy-line">
              {limiteDiarioAtingido && (
                <AvisoLimitePlano
                  titulo="Você usou suas 10 questões de hoje"
                  descricao="Amanhã tem mais 10. Para treinar sem limite diário, assine um plano."
                />
              )}
              <button
                type="button"
                className="w-full rounded-[9px] bg-vinke px-4 py-3 text-sm font-bold text-white transition hover:bg-vinke-deep disabled:opacity-50"
                disabled={!selectedOptionId || isSubmitting || limiteDiarioAtingido}
                onClick={() => void onConfirm()}
              >
                {isSubmitting ? "Confirmando…" : "Confirmar resposta"}
              </button>
            </div>
          )}

          {/* Navegação */}
          <div className="border-t border-vinke-line2 px-6 py-4 dark:border-vinke-navy-line">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onPrev}
                disabled={isFirst}
                className="flex flex-1 items-center justify-center gap-2 rounded-[9px] border-[1.5px] border-vinke-line px-4 py-3 text-sm font-bold text-vinke-ink transition hover:bg-vinke-offwhite disabled:opacity-40 dark:border-vinke-navy-line dark:text-slate-200 dark:hover:bg-vinke-navy-sel"
              >
                <ChevronLeft size={16} aria-hidden="true" />
                Anterior
              </button>

              {canFinalize ? (
                <button
                  type="button"
                  className="flex flex-1 items-center justify-center gap-2 rounded-[9px] bg-vinke px-4 py-3 text-sm font-bold text-white transition hover:bg-vinke-deep disabled:opacity-50"
                  onClick={() => void onFinish()}
                  disabled={finalizeDisabled}
                >
                  {isFinishing ? "Finalizando…" : "Finalizar e corrigir"}
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              ) : isReviewMode && isLast ? (
                <button
                  type="button"
                  className="flex flex-1 items-center justify-center gap-2 rounded-[9px] bg-vinke px-4 py-3 text-sm font-bold text-white transition hover:bg-vinke-deep"
                  onClick={() => router.push(`/aluno/simulados/${sessionId}/resultado`)}
                >
                  Ver resultado
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              ) : (
                <button
                  type="button"
                  className="flex flex-1 items-center justify-center gap-2 rounded-[9px] bg-vinke-navy px-4 py-3 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-40 dark:bg-white dark:text-vinke-navy"
                  onClick={onNext}
                  disabled={isReviewMode ? isLast : !confirmed || isLast}
                >
                  Próxima
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Reportar erro */}
        {showResultPanel && (
          <div className="space-y-3">
            {reportNotice ? (
              <div className={cn(
                "rounded-[10px] px-4 py-3 text-sm font-semibold",
                reportNotice.type === "success"
                  ? "bg-vinke-green-soft text-vinke-green-text dark:bg-vinke-green/10 dark:text-vinke-green"
                  : "bg-vinke-red-soft text-vinke-red dark:bg-vinke-red/10 dark:text-vinke-red-dark"
              )}>
                {reportNotice.text}
              </div>
            ) : null}

            {reportOpen ? (
              <div className="space-y-3 rounded-2xl bg-white p-5 dark:border dark:border-vinke-navy-line dark:bg-vinke-navy-card">
                <div className="text-sm font-bold text-vinke-ink dark:text-slate-100">Descreva o problema</div>
                <textarea
                  className="ui-textarea"
                  placeholder="Ex: enunciado incompleto, alternativa errada, gabarito incorreto…"
                  value={reportText}
                  onChange={(e) => setReportText(e.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rounded-[9px] bg-vinke px-4 py-2.5 text-xs font-bold text-white transition hover:bg-vinke-deep disabled:opacity-50"
                    onClick={() => void onSendReport()}
                    disabled={!safeStr(reportText) || reportSending}
                  >
                    {reportSending ? "Enviando…" : "Enviar"}
                  </button>
                  <button
                    type="button"
                    className="rounded-[9px] border-[1.5px] border-vinke-line px-4 py-2.5 text-xs font-bold text-vinke-ink dark:border-vinke-navy-line dark:text-slate-200"
                    onClick={() => setReportOpen(false)}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => { setReportNotice(null); setReportOpen(true); }}
                className="flex items-center gap-1.5 text-xs font-semibold text-vinke-ink4 transition hover:text-vinke-ink2 dark:hover:text-slate-400"
              >
                <Flag size={12} aria-hidden="true" />
                Reportar erro nesta questão
              </button>
            )}
          </div>
        )}
      </div>

      {/* Mapa da prova */}
      <div className="w-full shrink-0 rounded-2xl bg-white p-4 lg:w-[220px] dark:border dark:border-vinke-navy-line dark:bg-vinke-navy-card">
        <div className="mb-3 font-display text-xs font-bold text-vinke-ink dark:text-white">Mapa da prova</div>
        <div className="flex flex-wrap gap-1.5">
          {questionIdList.map((qid, i) => {
            const isCurrent = i === currentIndex;
            const isAnswered = answeredSet.has(qid);
            return (
              <button
                key={qid}
                type="button"
                onClick={() => jumpTo(i)}
                title={`Questão ${i + 1}`}
                className={cn(
                  "flex h-[26px] w-[26px] items-center justify-center rounded-lg text-[10px] font-bold transition",
                  isCurrent
                    ? "bg-vinke text-white"
                    : isAnswered
                    ? "bg-vinke-navy text-white dark:bg-white dark:text-vinke-navy"
                    : "border-[1.5px] border-vinke-line text-vinke-ink3 hover:border-vinke-ink4 dark:border-vinke-navy-line"
                )}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-col gap-1 text-[10px] font-semibold text-vinke-ink2 dark:text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded bg-vinke-navy dark:bg-white" /> respondida ({answeredSet.size})
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded bg-vinke" /> atual
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded border-[1.5px] border-vinke-line dark:border-vinke-navy-line" /> em branco
          </span>
        </div>
      </div>
    </div>
  );
}
