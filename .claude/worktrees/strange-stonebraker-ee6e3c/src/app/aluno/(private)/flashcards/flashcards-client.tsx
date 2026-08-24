"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { SkeletonCard } from "@/components/ui/skeleton";
import {
  Layers,
  ChevronDown,
  ChevronUp,
  Zap,
  X,
  BarChart2,
  CheckCircle2,
  Clock,
  Sparkles,
  Minus,
  XCircle,
} from "lucide-react";

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

type FlashcardDoc = {
  box?: number;
  nextReview?: unknown;
};

type QuestionBankDoc = {
  id: string;
  themes?: unknown;
  temas?: unknown;
  tema?: unknown;
  theme?: unknown;
  topic?: unknown;
  isActive?: unknown;
  explanation?: unknown;
  comentario?: unknown;
  comment?: unknown;
};

function tsToMs(v: unknown): number {
  if (!v) return 0;
  if (v instanceof Timestamp) return v.toMillis();
  if (typeof v === "object" && v !== null && "toMillis" in v) {
    return (v as { toMillis: () => number }).toMillis();
  }
  if (typeof v === "number") return v;
  return 0;
}

function safeStr(v: unknown) {
  return String(v ?? "").trim();
}

function hasUsableExplanation(q: QuestionBankDoc): boolean {
  const raw = safeStr(q.explanation ?? q.comentario ?? q.comment ?? "");
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

function extractThemes(q: QuestionBankDoc): string[] {
  const arr: string[] = [];
  if (Array.isArray(q.themes)) arr.push(...q.themes.map(safeStr).filter(Boolean));
  if (Array.isArray(q.temas)) arr.push(...q.temas.map(safeStr).filter(Boolean));
  [q.tema, q.theme, q.topic].map(safeStr).filter(Boolean).forEach((t) => arr.push(t));
  return [...new Set(arr)];
}

function toggle(list: string[], value: string) {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

export default function FlashcardsClient() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [temas, setTemas] = useState<string[]>([]);
  const [selectedTemas, setSelectedTemas] = useState<string[]>([]);
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const [themeQuery, setThemeQuery] = useState("");

  // Flashcard stats from Firestore
  const [flashcardDocs, setFlashcardDocs] = useState<FlashcardDoc[]>([]);

  useEffect(() => {
    const run = async () => {
      const u = auth.currentUser;
      if (!u) return;
      setLoading(true);
      try {
        const [qbSnap, fcSnap] = await Promise.all([
          getDocs(collection(db, "questionsBank")),
          getDocs(collection(db, "users", u.uid, "flashcards")),
        ]);

        const allThemes = new Set<string>();
        qbSnap.docs.forEach((d) => {
          const q = { id: d.id, ...(d.data() as Omit<QuestionBankDoc, "id">) };
          if (!hasUsableExplanation(q)) return;
          extractThemes(q).forEach((t) => allThemes.add(t));
        });
        setTemas(Array.from(allThemes).sort((a, b) => a.localeCompare(b, "pt-BR")));

        setFlashcardDocs(fcSnap.docs.map((d) => d.data() as FlashcardDoc));
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, []);

  const stats = useMemo(() => {
    const now = Date.now();
    const studied = flashcardDocs.length;
    const due = flashcardDocs.filter((fc) => tsToMs(fc.nextReview) <= now).length;
    const mastered = flashcardDocs.filter((fc) => (fc.box ?? 1) >= 4).length;
    const learning = flashcardDocs.filter((fc) => (fc.box ?? 1) < 4).length;
    return { studied, due, mastered, learning };
  }, [flashcardDocs]);

  const filteredTemas = useMemo(() => {
    if (!themeQuery.trim()) return temas;
    const q = themeQuery.trim().toLowerCase();
    return temas.filter((t) => t.toLowerCase().includes(q));
  }, [temas, themeQuery]);

  const hasFilters = selectedTemas.length > 0;

  function onStart() {
    const params = new URLSearchParams();
    if (selectedTemas.length > 0) {
      params.set("temas", selectedTemas.join(","));
    }
    router.push(`/aluno/flashcards/estudar?${params.toString()}`);
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />)}
        </div>
        <SkeletonCard lines={3} />
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-500">Estudo</div>
          <div className="mt-0.5 text-3xl font-black text-slate-900 dark:text-slate-100">Flashcards</div>
          <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Revisão espaçada com as questões do banco — memorize mais, em menos tempo.
          </div>
        </div>
      </div>

      {/* Como funciona (legenda) */}
      <div className="rounded-2xl border border-indigo-200/60 bg-indigo-50/40 p-4 sm:p-5 dark:border-indigo-900/30 dark:bg-indigo-950/20">
        <div className="flex items-center gap-2 text-sm font-black text-indigo-700 dark:text-indigo-300">
          <Sparkles size={15} />
          Como funciona
        </div>
        <div className="mt-2 space-y-1.5 text-sm text-indigo-700/80 dark:text-indigo-300/80">
          <div>📖 <b>Frente</b>: leia o enunciado e tente responder mentalmente.</div>
          <div>✅ <b>Verso</b>: confira a resposta correta e o comentário do gabarito.</div>
          <div>🧠 <b>Avalie-se</b>: sua resposta define quando o card volta a aparecer (revisão espaçada).</div>
        </div>

        {/* Legenda dos botões */}
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-emerald-200 bg-white/60 px-3 py-2 dark:border-emerald-900/40 dark:bg-emerald-950/20">
            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 size={13} /> Sabia
            </div>
            <div className="mt-0.5 text-[11px] leading-relaxed text-emerald-700/70 dark:text-emerald-300/70">
              Acertou com facilidade. O card sobe de caixa e demora mais para reaparecer.
            </div>
          </div>
          <div className="rounded-xl border border-amber-200 bg-white/60 px-3 py-2 dark:border-amber-900/40 dark:bg-amber-950/20">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-300">
              <Minus size={13} /> Quase
            </div>
            <div className="mt-0.5 text-[11px] leading-relaxed text-amber-700/70 dark:text-amber-300/70">
              Lembrou, mas com esforço ou insegurança. O card fica na mesma caixa e volta no mesmo intervalo.
            </div>
          </div>
          <div className="rounded-xl border border-rose-200 bg-white/60 px-3 py-2 dark:border-rose-900/40 dark:bg-rose-950/20">
            <div className="flex items-center gap-1.5 text-xs font-bold text-rose-600 dark:text-rose-300">
              <XCircle size={13} /> Não sabia
            </div>
            <div className="mt-0.5 text-[11px] leading-relaxed text-rose-600/70 dark:text-rose-300/70">
              Errou ou não lembrou. O card volta para o início e reaparece já amanhã.
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className={cn(
          "rounded-2xl border px-4 py-4",
          stats.due > 0
            ? "border-indigo-200 bg-indigo-50/50 dark:border-indigo-900/30 dark:bg-indigo-950/20"
            : "border-slate-200 bg-white dark:border-slate-800/80 dark:bg-slate-900/50"
        )}>
          <div className={cn("flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide",
            stats.due > 0 ? "text-indigo-500 dark:text-indigo-400" : "text-slate-500 dark:text-slate-500"
          )}>
            <Clock size={11} />
            Para revisar
          </div>
          <div className={cn("mt-1 text-2xl font-black",
            stats.due > 0 ? "text-indigo-700 dark:text-indigo-300" : "text-slate-900 dark:text-slate-100"
          )}>
            {stats.due || "—"}
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-500">prontos para hoje</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 dark:border-slate-800/80 dark:bg-slate-900/50">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-500">
            <BarChart2 size={11} />
            Estudados
          </div>
          <div className="mt-1 text-2xl font-black text-slate-900 dark:text-slate-100">{stats.studied || "—"}</div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-500">vistos ao menos uma vez</div>
        </div>
        <div className={cn(
          "rounded-2xl border px-4 py-4",
          stats.mastered > 0
            ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/30 dark:bg-emerald-950/20"
            : "border-slate-200 bg-white dark:border-slate-800/80 dark:bg-slate-900/50"
        )}>
          <div className={cn("flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide",
            stats.mastered > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500 dark:text-slate-500"
          )}>
            <CheckCircle2 size={11} />
            Dominados
          </div>
          <div className={cn("mt-1 text-2xl font-black",
            stats.mastered > 0 ? "text-emerald-700 dark:text-emerald-300" : "text-slate-900 dark:text-slate-100"
          )}>
            {stats.mastered || "—"}
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-500">caixa 4 ou 5</div>
        </div>
      </div>

      {/* Filtro de temas */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800/80 dark:bg-slate-900/50">
        <button
          type="button"
          onClick={() => setThemePickerOpen((p) => !p)}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <div>
            <div className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-slate-100">
              <Layers size={15} />
              Filtrar por tema
              {selectedTemas.length > 0 && (
                <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-bold text-white dark:bg-blue-500">
                  {selectedTemas.length}
                </span>
              )}
            </div>
            <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {selectedTemas.length === 0
                ? "Todos os temas (padrão)"
                : selectedTemas.slice(0, 2).join(", ") + (selectedTemas.length > 2 ? ` +${selectedTemas.length - 2}` : "")}
            </div>
          </div>
          {themePickerOpen ? <ChevronUp size={16} className="shrink-0 text-slate-400" /> : <ChevronDown size={16} className="shrink-0 text-slate-400" />}
        </button>

        {themePickerOpen && (
          <div className="mt-4 space-y-3">
            <input
              type="text"
              value={themeQuery}
              onChange={(e) => setThemeQuery(e.target.value)}
              placeholder="Buscar tema…"
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-blue-500"
            />
            <div className="flex flex-wrap gap-2">
              {filteredTemas.map((t) => {
                const active = selectedTemas.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setSelectedTemas((prev) => toggle(prev, t))}
                    className={cn(
                      "flex items-center gap-1.5 rounded-2xl border px-3 py-1.5 text-sm font-semibold transition",
                      active
                        ? "border-slate-900 bg-slate-900 text-white dark:border-blue-500 dark:bg-blue-500"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                    )}
                  >
                    {t}
                    {active && <X size={11} />}
                  </button>
                );
              })}
              {filteredTemas.length === 0 && (
                <div className="text-sm text-slate-400">Nenhum tema encontrado.</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Ações */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-slate-600 dark:text-slate-400">
          {selectedTemas.length === 0
            ? <span>Todos os temas</span>
            : <span><b className="text-slate-900 dark:text-slate-100">{selectedTemas.length}</b> tema{selectedTemas.length > 1 ? "s" : ""} selecionado{selectedTemas.length > 1 ? "s" : ""}</span>
          }
          {stats.due > 0 && (
            <span className="ml-2 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-600 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-400">
              {stats.due} para revisar hoje
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasFilters && (
            <Button variant="secondary" onClick={() => setSelectedTemas([])} className="gap-1.5">
              <X size={13} />
              Limpar
            </Button>
          )}
          <Button onClick={onStart} className="gap-2">
            <Zap size={14} />
            Estudar agora
          </Button>
        </div>
      </div>
    </div>
  );
}
