"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { getOrCreateDailyQuestion, markDailyAnswered, type RawQuestion } from "@/lib/daily";
import { recordAnswer } from "@/lib/study-tracking";
import { Button } from "@/components/ui/button";
import { CalendarDays, CheckCircle2, XCircle, ChevronLeft, RotateCcw, Sparkles } from "lucide-react";

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

function getOptions(q: RawQuestion): QuestionOption[] {
  const raw = q.options;
  if (!Array.isArray(raw)) return [];
  return (raw as QuestionOption[])
    .map((o) => ({ id: safeStr(o.id).toUpperCase(), text: safeStr(o.text), imageUrl: o.imageUrl ?? null }))
    .filter((o) => o.id)
    .sort((a, b) => a.id.localeCompare(b.id));
}

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
        <div className="h-14 w-14 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
        <div className="text-sm text-slate-500 dark:text-slate-400">Preparando sua questão do dia…</div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 dark:bg-rose-950/40">
          <CalendarDays size={28} className="text-rose-400" />
        </div>
        <div className="text-lg font-black text-slate-900 dark:text-slate-100">Ops!</div>
        <div className="text-sm text-slate-500 dark:text-slate-400">{errMsg}</div>
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
      {/* Top bar */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/aluno")}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          <ChevronLeft size={16} />
        </button>
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-indigo-500 dark:text-indigo-400">
            <CalendarDays size={13} /> Questão do dia
          </div>
          {tema && <div className="text-sm font-black text-slate-900 dark:text-slate-100">{tema}</div>}
        </div>
      </div>

      {/* Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800/80 dark:bg-slate-900/60">
        {statementHtml ? (
          <div
            className="text-[15px] leading-7 text-slate-900 dark:text-slate-100 [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:underline"
            dangerouslySetInnerHTML={{ __html: statementHtml }}
          />
        ) : (
          <div className="text-sm italic text-slate-400">Sem enunciado disponível.</div>
        )}

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
                    ? "border-emerald-300 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30"
                    : isWrongChosen
                    ? "border-rose-300 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/30"
                    : isThisChosen && !revealed
                    ? "border-blue-400 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/30"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
                )}
              >
                <span className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-black text-white",
                  isThisCorrect ? "bg-emerald-500" : isWrongChosen ? "bg-rose-500" : isThisChosen && !revealed ? "bg-blue-500" : "bg-slate-300 dark:bg-slate-600"
                )}>
                  {opt.id}
                </span>
                <span className="pt-0.5 text-slate-700 dark:text-slate-200">{opt.text || "—"}</span>
                {isThisCorrect && <CheckCircle2 size={16} className="ml-auto mt-0.5 shrink-0 text-emerald-500" />}
                {isWrongChosen && <XCircle size={16} className="ml-auto mt-0.5 shrink-0 text-rose-500" />}
              </button>
            );
          })}
        </div>

        {/* Confirm or result */}
        {!revealed ? (
          <Button className="mt-5 w-full" onClick={onConfirm} disabled={!selected || submitting}>
            {submitting ? "Confirmando…" : "Confirmar resposta"}
          </Button>
        ) : (
          <div className="mt-5 space-y-4">
            <div className={cn(
              "flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-bold",
              isCorrect
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300"
                : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300"
            )}>
              {isCorrect ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
              {isCorrect ? "Você acertou! 🎉" : "Você errou — foi pro seu Caderno de Erros."}
            </div>

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
        )}
      </div>

      {/* Footer actions when revealed */}
      {revealed && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button className="flex-1 gap-2" onClick={() => router.push("/aluno/simulados/novo")}>
            <Sparkles size={14} /> Fazer um simulado
          </Button>
          <Button variant="secondary" className="flex-1 gap-2" onClick={() => router.push("/aluno")}>
            <ChevronLeft size={14} /> Voltar ao início
          </Button>
        </div>
      )}

      <div className="text-center text-xs text-slate-400 dark:text-slate-600">
        Uma nova questão é liberada a cada dia.
      </div>
    </div>
  );
}
