"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { getOrCreateDailyQuestion, markDailyAnswered, type RawQuestion } from "@/lib/daily";
import { recordAnswer } from "@/lib/study-tracking";
import { Button } from "@/components/ui/button";
import { CalendarDays, ChevronLeft, RotateCcw } from "lucide-react";

type Phase = "loading" | "error" | "answering" | "revealed";

type QuestionOption = { id: string; text?: string; imageUrl?: string | null };

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function safeStr(v: unknown): string {
  return String(v ?? "").trim();
}

function getStatement(q: RawQuestion): string {
  return safeStr(
    q.enunciado ?? q.statement ?? q.prompt ?? q.pergunta ?? q.title ?? q.text ?? q.question
  );
}

function getCorrectId(q: RawQuestion): string {
  return safeStr(q.correctOptionId ?? q.correctOption ?? q.correct ?? q.gabarito).toUpperCase();
}

function getExplanation(q: RawQuestion): string {
  return safeStr(q.explanation ?? q.comentario ?? q.comment ?? "");
}

function getImageUrl(q: RawQuestion): string {
  return safeStr(q.imageUrl ?? q.image ?? "");
}

function getOptions(q: RawQuestion): QuestionOption[] {
  const raw = q.options;
  if (!Array.isArray(raw)) return [];
  return (raw as QuestionOption[])
    .map((o) => ({ id: safeStr(o.id).toUpperCase(), text: safeStr(o.text), imageUrl: o.imageUrl ?? null }))
    .filter((o) => o.id)
    .sort((a, b) => a.id.localeCompare(b.id));
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

export default function QuestaoDoDiaClient() {
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("loading");
  const [errMsg, setErrMsg] = useState("");
  const [question, setQuestion] = useState<RawQuestion | null>(null);
  const [dateKey, setDateKey] = useState("");
  const [tema, setTema] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [streak, setStreak] = useState(0);

  const load = useCallback(async () => {
    const u = auth.currentUser;
    if (!u) {
      setErrMsg("Você precisa estar logado.");
      setPhase("error");
      return;
    }
    setPhase("loading");
    try {
      const res = await getOrCreateDailyQuestion(u.uid);
      if (!res.question) {
        setErrMsg("Não há questão disponível hoje. Tente novamente mais tarde.");
        setPhase("error");
        return;
      }
      setQuestion(res.question);
      setDateKey(res.dateKey);
      setTema(res.tema);
      try {
        const statsSnap = await getDoc(doc(db, "users", u.uid, "meta", "stats"));
        if (statsSnap.exists()) {
          setStreak(Number((statsSnap.data() as { streakCount?: number }).streakCount ?? 0));
        }
      } catch { /* streak é decorativo */ }
      if (res.answered) {
        setSelected(res.selectedOptionId);
        setIsCorrect(res.isCorrect);
        setPhase("revealed");
      } else {
        setPhase("answering");
      }
    } catch (e) {
      console.error(e);
      setErrMsg(e instanceof Error ? e.message : "Falha ao carregar a questão do dia.");
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const correctId = useMemo(() => (question ? getCorrectId(question) : ""), [question]);
  const options = useMemo(() => (question ? getOptions(question) : []), [question]);
  const statementHtml = useMemo(() => (question ? toHtml(getStatement(question)) : ""), [question]);
  const imageUrl = useMemo(() => (question ? getImageUrl(question) : ""), [question]);
  const explanationHtml = useMemo(() => (question ? toHtml(getExplanation(question)) : ""), [question]);

  async function onConfirm() {
    const u = auth.currentUser;
    if (!u || !question || !selected || submitting) return;
    setSubmitting(true);
    const ok = !!correctId && selected === correctId;
    try {
      void recordAnswer({
        uid: u.uid,
        question,
        isCorrect: ok,
        selectedOptionId: selected,
        correctOptionId: correctId || null,
      });
      void markDailyAnswered(u.uid, dateKey, ok, selected);
      setIsCorrect(ok);
      setPhase("revealed");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Loading / error ──────────────────────────────────────────────────────
  if (phase === "loading") {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center gap-4">
        <div className="h-14 w-14 animate-pulse rounded-2xl bg-vinke-line2 dark:bg-vinke-navy-sel" />
        <div className="text-sm text-vinke-ink3">Preparando sua questão do dia…</div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-vinke-red-soft dark:bg-vinke-red/10">
          <CalendarDays size={28} className="text-vinke-red" />
        </div>
        <div className="font-display text-lg font-bold text-vinke-ink dark:text-slate-100">Ops!</div>
        <div className="text-sm text-vinke-ink3">{errMsg}</div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => router.push("/aluno")} className="gap-2">
            <ChevronLeft size={14} /> Início
          </Button>
          <Button onClick={load} className="gap-2">
            <RotateCcw size={14} /> Tentar de novo
          </Button>
        </div>
      </div>
    );
  }

  const revealed = phase === "revealed";

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="font-display text-2xl font-bold text-vinke-ink dark:text-white">Questão do dia</span>
          <span className="text-xs font-medium text-vinke-ink3">Uma por dia. Responder mantém sua sequência.</span>
        </div>
        {streak > 0 ? (
          <div className="flex items-center gap-2.5 rounded-[14px] bg-vinke-navy px-4 py-2.5">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M13 2 4 14h6l-1 8 9-12h-6z" fill="#F0A63A" /></svg>
            <div className="flex flex-col">
              <span className="font-display text-lg font-bold leading-tight text-white">{streak} {streak === 1 ? "dia" : "dias"}</span>
              <span className="text-[9px] font-semibold tracking-[0.08em] text-vinke-ink3">DE SEQUÊNCIA</span>
            </div>
          </div>
        ) : null}
      </div>

      {/* Card */}
      <div className="rounded-2xl bg-white p-5 sm:p-6 dark:border dark:border-vinke-navy-line dark:bg-vinke-navy-card">
        {tema ? (
          <span className="mb-3 inline-block rounded-full bg-vinke-soft px-2.5 py-0.5 text-[10px] font-bold text-vinke dark:bg-vinke/15 dark:text-vinke-lav">
            {tema}
          </span>
        ) : null}
        {statementHtml ? (
          <div
            className="text-[15px] leading-7 text-vinke-ink dark:text-slate-100 [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:underline"
            dangerouslySetInnerHTML={{ __html: statementHtml }}
          />
        ) : (
          <div className="text-sm italic text-vinke-ink4">Sem enunciado disponível.</div>
        )}

        {imageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={imageUrl}
            alt="Imagem da questão"
            className="mt-4 max-h-64 w-auto rounded-xl border border-vinke-line dark:border-vinke-navy-line"
          />
        ) : null}

        {/* Options */}
        <div className="mt-5 space-y-2">
          {options.map((opt) => {
            const isThisCorrect = revealed && opt.id === correctId;
            const isThisChosen = opt.id === safeStr(selected).toUpperCase();
            const isWrongChosen = revealed && isThisChosen && opt.id !== correctId;
            return (
              <button
                key={opt.id}
                type="button"
                disabled={revealed}
                onClick={() => setSelected(opt.id)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition",
                  isThisCorrect
                    ? "border-vinke-green bg-vinke-green-soft dark:bg-vinke-green/10"
                    : isWrongChosen
                    ? "border-vinke-red bg-vinke-red-soft dark:bg-vinke-red/10"
                    : isThisChosen && !revealed
                    ? "border-vinke bg-vinke-soft dark:bg-vinke/15"
                    : "border-vinke-line bg-white hover:border-vinke-ink4 hover:bg-vinke-offwhite dark:border-vinke-navy-line dark:bg-transparent dark:hover:bg-vinke-navy-sel/50"
                )}
              >
                <span className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white",
                  isThisCorrect ? "bg-vinke-green" : isWrongChosen ? "bg-vinke-red" : isThisChosen && !revealed ? "bg-vinke" : "bg-vinke-ink4 dark:bg-vinke-navy-sel"
                )}>
                  {opt.id}
                </span>
                <span className="min-w-0 pt-0.5 text-vinke-ink dark:text-slate-200">
                  <span className="block">{opt.text || "—"}</span>
                  {opt.imageUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={opt.imageUrl}
                      alt=""
                      className="mt-2 max-h-40 rounded-lg border border-vinke-line dark:border-vinke-navy-line"
                    />
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>

        {/* Confirm or result */}
        {!revealed ? (
          <button
            type="button"
            className="mt-5 w-full rounded-[9px] bg-vinke px-4 py-3 text-sm font-bold text-white transition hover:bg-vinke-deep disabled:opacity-50"
            onClick={() => void onConfirm()}
            disabled={!selected || submitting}
          >
            {submitting ? "Confirmando…" : "Confirmar resposta"}
          </button>
        ) : (
          <div className="mt-5 space-y-4">
            <div className={cn(
              "flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-bold",
              isCorrect
                ? "border-transparent bg-vinke-green-soft text-vinke-green-text dark:bg-vinke-green/10 dark:text-vinke-green"
                : "border-transparent bg-vinke-red-soft text-vinke-red dark:bg-vinke-red/10 dark:text-vinke-red-dark"
            )}>
              {isCorrect ? "✓ Você acertou! Sequência mantida." : "✗ Você errou — foi pro seu Caderno de Erros."}
            </div>

            {explanationHtml && (
              <div className="rounded-xl bg-vinke-offwhite p-3.5 dark:bg-vinke-navy">
                <div className="text-[11px] font-bold text-vinke-ink dark:text-slate-100">Comentário</div>
                <div
                  className="mt-1 text-sm leading-6 text-vinke-ink2 dark:text-slate-300 [&_p]:my-1 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:underline"
                  dangerouslySetInnerHTML={{ __html: explanationHtml }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Convite para continuar */}
      {revealed && (
        <div className="flex flex-col gap-3 rounded-[14px] bg-vinke p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="font-display text-sm font-bold text-white">
              {isCorrect ? "Aquecida a máquina? Continue por aqui." : "Bora virar esse jogo?"}
            </span>
            <span className="text-[11px] font-medium text-[#C9BCF9]">
              Seu plano de hoje te espera com o próximo passo.
            </span>
          </div>
          <button
            type="button"
            onClick={() => router.push("/aluno/estudo-de-hoje")}
            className="shrink-0 rounded-[9px] bg-white px-4 py-2.5 text-xs font-bold text-vinke transition hover:opacity-90"
          >
            Estudo de hoje →
          </button>
        </div>
      )}

      <div className="text-center text-xs text-vinke-ink4">
        Uma nova questão é liberada a cada dia.
      </div>
    </div>
  );
}
