"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { addDoc, collection, getDocs, limit, orderBy, query, serverTimestamp, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, X, Zap, Filter } from "lucide-react";
import { SkeletonCard } from "@/components/ui/skeleton";

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function toggle(list: string[], value: string) {
  const arr = Array.isArray(list) ? list : [];
  return arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value];
}

type Prova = { id: string; nome?: string; sigla?: string; ativo?: boolean; ordem?: number };
type TemaDoc = { nome?: string; tema?: string; title?: string; ativo?: boolean };

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

type QuestionBankDoc = {
  id: string;
  isActive?: unknown;
  examType?: unknown;
  specialization?: unknown;
  themes?: unknown;
  temas?: unknown;
  tema?: unknown;
  theme?: unknown;
  topic?: unknown;
  prova?: unknown;
  provaId?: unknown;
  provaSigla?: unknown;
  nivel?: unknown;
  level?: unknown;
  options?: Array<{ id?: unknown }>;
};

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normalizeTitleParts(parts: string[]) {
  return parts.map((p) => String(p || "").trim()).filter(Boolean)
    .filter((p) => p.toLowerCase() !== "todos" && p.toLowerCase() !== "todas");
}

function norm(v: unknown) { return String(v ?? "").trim().toUpperCase(); }
function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}
function uniq(items: string[]) { return Array.from(new Set(items.filter(Boolean))); }

function extractThemes(q: QuestionBankDoc): string[] {
  const fromArrays = [...toStringArray(q.themes), ...toStringArray(q.temas)];
  const single = [q.tema, q.theme, q.topic].map((v) => String(v ?? "").trim()).filter(Boolean);
  return uniq([...fromArrays, ...single]);
}
function extractExamTokens(q: QuestionBankDoc): string[] {
  return uniq([q.examType, q.prova, q.provaSigla, q.provaId].map(norm).filter(Boolean));
}
function extractLevelTokens(q: QuestionBankDoc): string[] {
  return uniq([q.specialization, q.nivel, q.level].map(norm).filter(Boolean));
}

// Pill component
function Pill({
  label,
  count,
  active,
  disabled,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1.5 rounded-2xl border px-3 py-2 text-sm font-semibold transition",
        active
          ? "border-slate-900 bg-slate-900 text-white dark:border-blue-500 dark:bg-blue-500"
          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800",
        disabled && !active && "cursor-not-allowed opacity-40"
      )}
    >
      <span className="truncate">{label}</span>
      {count !== undefined && (
        <span className={cn("text-xs", active ? "opacity-70" : "text-slate-400 dark:text-slate-500")}>
          ({count})
        </span>
      )}
    </button>
  );
}

export default function NovoSimuladoClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = auth.currentUser;

  const [provas, setProvas] = useState<Prova[]>([]);
  const [temas, setTemas] = useState<string[]>([]);
  const [questionsPool, setQuestionsPool] = useState<QuestionBankDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [selectedProvas, setSelectedProvas] = useState<string[]>([]);
  const [selectedNiveis, setSelectedNiveis] = useState<string[]>([]);
  const [selectedTemas, setSelectedTemas] = useState<string[]>([]);
  const [qtd, setQtd] = useState<number>(10);
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const [themeQuery, setThemeQuery] = useState("");

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const pSnap = await getDocs(query(collection(db, "provas"), where("ativo", "==", true), orderBy("ordem", "asc"), limit(50)));
        setProvas(pSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Prova, "id">) })));

        const collectedThemes = new Set<string>();
        try {
          const tSnap = await getDocs(collection(db, "temas"));
          tSnap.docs.forEach((d) => {
            const data = d.data() as TemaDoc;
            if (data.ativo === false) return;
            const label = data.nome ?? data.tema ?? data.title;
            if (hasText(label)) collectedThemes.add(label.trim());
          });
        } catch { /* fallback abaixo */ }

        try {
          const qbSnap = await getDocs(collection(db, "questionsBank"));
          const pool: QuestionBankDoc[] = [];
          qbSnap.docs.forEach((d) => {
            const q = { id: d.id, ...(d.data() as Omit<QuestionBankDoc, "id">) };
            pool.push(q);
            extractThemes(q).forEach((t) => collectedThemes.add(t));
          });
          setQuestionsPool(pool);
        } catch { /* mantém temas */ }

        setTemas(Array.from(collectedThemes).sort((a, b) => a.localeCompare(b, "pt-BR")));
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  useEffect(() => {
    const rawQtd = Number(searchParams.get("qtd"));
    if ([10, 20, 30, 50].includes(rawQtd)) setQtd(rawQtd);
  }, [searchParams]);

  useEffect(() => {
    const provaId = (searchParams.get("provaId") || "").trim();
    if (!provaId || provas.length === 0) return;
    if (!provas.some((p) => p.id === provaId)) return;
    setSelectedProvas((prev) => (prev.includes(provaId) ? prev : [...prev, provaId]));
  }, [searchParams, provas]);

  useEffect(() => {
    const rawTema = (searchParams.get("tema") || "").trim();
    if (!rawTema || temas.length === 0) return;
    const matched = temas.find((t) => t.toLocaleLowerCase("pt-BR") === rawTema.toLocaleLowerCase("pt-BR"));
    if (!matched) return;
    setSelectedTemas((prev) => (prev.includes(matched) ? prev : [...prev, matched]));
  }, [searchParams, temas]);

  const selectedExamTokens = useMemo(() => {
    if (!selectedProvas.length) return [];
    return uniq(selectedProvas.flatMap((pid) => {
      const p = provas.find((x) => x.id === pid);
      return [p?.sigla, p?.id, p?.nome].map(norm).filter(Boolean);
    }));
  }, [selectedProvas, provas]);

  const title = useMemo(() => {
    const provasLabel = selectedProvas.length
      ? selectedProvas.map((pid) => { const p = provas.find((x) => x.id === pid); return String(p?.sigla || p?.nome || p?.id || "").trim(); }).filter(Boolean).join(", ")
      : "Todas";
    return `Simulado • ${provasLabel} • ${selectedNiveis.length === 0 ? "Todos" : selectedNiveis.join(", ")} • ${selectedTemas.length === 0 ? "Todos" : selectedTemas.join(", ")}`;
  }, [selectedNiveis, selectedProvas, selectedTemas, provas]);

  const titleDisplay = useMemo(() => {
    const parts = title.split("•").map((p) => p.trim());
    const [main, ...rest] = parts;
    const cleaned = normalizeTitleParts(rest);
    return cleaned.length ? `${main} • ${cleaned.join(" • ")}` : main || "Simulado";
  }, [title]);

  const filteredTemas = useMemo(() => {
    const q = themeQuery.trim().toLowerCase();
    return q ? temas.filter((t) => t.toLowerCase().includes(q)) : temas;
  }, [temas, themeQuery]);

  const activeQuestions = useMemo(() => questionsPool.filter((q) => q.isActive !== false), [questionsPool]);

  function matchesFilters(q: QuestionBankDoc, { examTokens, niveis, temasSelecionados }: { examTokens: string[]; niveis: string[]; temasSelecionados: string[] }) {
    if (examTokens.length > 0) {
      const tokens = extractExamTokens(q);
      if (!tokens.some((t) => examTokens.includes(t))) return false;
    }
    if (niveis.length > 0) {
      const levels = extractLevelTokens(q);
      if (!levels.some((l) => niveis.includes(l))) return false;
    }
    if (temasSelecionados.length > 0) {
      const qThemes = extractThemes(q);
      if (!temasSelecionados.some((t) => qThemes.includes(t))) return false;
    }
    return true;
  }

  const availableQuestions = useMemo(
    () => activeQuestions.filter((q) => matchesFilters(q, { examTokens: selectedExamTokens, niveis: selectedNiveis, temasSelecionados: selectedTemas })),
    [activeQuestions, selectedExamTokens, selectedNiveis, selectedTemas]
  );
  const availableCount = availableQuestions.length;
  const effectiveQuestionCount = Math.min(qtd, availableCount);

  const provaCounts = useMemo(() => Object.fromEntries(provas.map((p) => {
    const provaTokens = [p.sigla, p.id, p.nome].map(norm).filter(Boolean);
    return [p.id, activeQuestions.filter((q) => matchesFilters(q, { examTokens: provaTokens, niveis: selectedNiveis, temasSelecionados: selectedTemas })).length];
  })) as Record<string, number>, [provas, activeQuestions, selectedNiveis, selectedTemas]);

  const nivelCounts = useMemo(() => Object.fromEntries(["R1", "R2", "R3"].map((n) => [
    n, activeQuestions.filter((q) => matchesFilters(q, { examTokens: selectedExamTokens, niveis: [n], temasSelecionados: selectedTemas })).length
  ])) as Record<string, number>, [activeQuestions, selectedExamTokens, selectedTemas]);

  const temaCounts = useMemo(() => Object.fromEntries(temas.map((t) => [
    t, activeQuestions.filter((q) => matchesFilters(q, { examTokens: selectedExamTokens, niveis: selectedNiveis, temasSelecionados: [t] })).length
  ])) as Record<string, number>, [temas, activeQuestions, selectedExamTokens, selectedNiveis]);

  async function pickQuestions(): Promise<QuestionBankDoc[]> {
    const source = questionsPool.length > 0 ? questionsPool
      : (await getDocs(collection(db, "questionsBank"))).docs.map((d) => ({ id: d.id, ...(d.data() as Omit<QuestionBankDoc, "id">) }));
    return shuffle(source.filter((q) => q.isActive !== false).filter((q) => matchesFilters(q, { examTokens: selectedExamTokens, niveis: selectedNiveis, temasSelecionados: selectedTemas }))).slice(0, qtd);
  }

  const createSimulado = async () => {
    if (!user) return;
    setCreating(true);
    try {
      const selectedQuestions = await pickQuestions();
      const questionIds = selectedQuestions.map((q) => q.id);
      if (!questionIds.length) return;
      const sessionRef = await addDoc(collection(db, "users", user.uid, "sessions"), {
        title, titleDisplay, status: "in_progress",
        filters: { provas: selectedExamTokens, provaIds: selectedProvas, niveis: selectedNiveis, temas: selectedTemas },
        questionIds, totalQuestions: questionIds.length, currentIndex: 0,
        answeredCount: 0, correctCount: 0, wrongCount: 0, scorePercent: 0,
        updatedAt: serverTimestamp(), createdAt: serverTimestamp(),
      });
      router.push(`/aluno/simulados/${sessionRef.id}`);
    } catch (e) {
      console.error(e);
    } finally {
      setCreating(false);
    }
  };

  const canCreate = !creating && availableCount > 0;
  const hasFilters = selectedProvas.length > 0 || selectedNiveis.length > 0 || selectedTemas.length > 0;

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-500">Criar</div>
          <div className="mt-0.5 text-3xl font-black text-slate-900 dark:text-slate-100">Novo simulado</div>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <SkeletonCard lines={4} />
          <SkeletonCard lines={4} />
          <SkeletonCard lines={4} />
        </div>
        <SkeletonCard lines={6} />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-28">

      {/* Header */}
      <div>
        <div className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-500">Criar</div>
        <div className="mt-0.5 text-3xl font-black text-slate-900 dark:text-slate-100">Novo simulado</div>
        <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Selecione os filtros e gere um simulado personalizado.
        </div>
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

        {/* Provas */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800/80 dark:bg-slate-900/50">
          <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-500">Prova</div>
          <div className="mt-0.5 font-black text-slate-900 dark:text-slate-100">Tipo de exame</div>
          <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">Sem filtro = todas as provas</div>
          <div className="mt-4 flex flex-wrap gap-2">
            {provas.map((p) => (
              <Pill key={p.id} label={p.sigla || p.nome || p.id}
                count={provaCounts[p.id] ?? 0}
                active={selectedProvas.includes(p.id)}
                disabled={!selectedProvas.includes(p.id) && (provaCounts[p.id] ?? 0) === 0}
                onClick={() => setSelectedProvas((prev) => toggle(prev, p.id))} />
            ))}
          </div>
        </div>

        {/* Especialização */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800/80 dark:bg-slate-900/50">
          <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-500">Nível</div>
          <div className="mt-0.5 font-black text-slate-900 dark:text-slate-100">Especialização</div>
          <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">Sem filtro = todos os níveis</div>
          <div className="mt-4 flex flex-wrap gap-2">
            {["R1", "R2", "R3"].map((n) => (
              <Pill key={n} label={n}
                count={nivelCounts[n] ?? 0}
                active={selectedNiveis.includes(n)}
                disabled={!selectedNiveis.includes(n) && (nivelCounts[n] ?? 0) === 0}
                onClick={() => setSelectedNiveis((prev) => toggle(prev, n))} />
            ))}
          </div>
        </div>

        {/* Quantidade */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800/80 dark:bg-slate-900/50">
          <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-500">Qtd</div>
          <div className="mt-0.5 font-black text-slate-900 dark:text-slate-100">Questões</div>
          <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">Número de questões do simulado</div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {[10, 20, 30, 50].map((n) => (
              <button key={n} type="button" onClick={() => setQtd(n)}
                className={cn(
                  "rounded-2xl border px-4 py-3 text-sm font-semibold transition",
                  qtd === n
                    ? "border-slate-900 bg-slate-900 text-white dark:border-blue-500 dark:bg-blue-500"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800"
                )}>
                {n} questões
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Temas */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800/80 dark:bg-slate-900/50">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-500">Filtro</div>
            <div className="mt-0.5 font-black text-slate-900 dark:text-slate-100">Temas</div>
            <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              Dica: escolha 1–3 temas para ficar mais direcionado.
            </div>
          </div>
          {selectedTemas.length > 0 && (
            <button type="button" onClick={() => { setSelectedTemas([]); setThemeQuery(""); }}
              className="shrink-0 text-xs font-semibold text-slate-500 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100">
              Limpar temas
            </button>
          )}
        </div>

        {/* Toggle dropdown */}
        <button type="button" onClick={() => setThemePickerOpen((v) => !v)}
          className="mt-4 flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-200 dark:hover:bg-slate-800">
          <span>{selectedTemas.length > 0 ? `${selectedTemas.length} tema(s) selecionado(s)` : "Selecionar temas"}</span>
          {themePickerOpen ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </button>

        {themePickerOpen && (
          <div className="mt-2 rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            <div className="border-b border-slate-100 p-3 dark:border-slate-800">
              <input type="text" value={themeQuery} onChange={(e) => setThemeQuery(e.target.value)}
                placeholder="Buscar tema…" className="ui-input" />
            </div>
            <div className="max-h-64 overflow-y-auto">
              {filteredTemas.length ? (
                <div className="divide-y divide-slate-50 dark:divide-slate-800">
                  {filteredTemas.map((t) => {
                    const active = selectedTemas.includes(t);
                    const count = temaCounts[t] ?? 0;
                    return (
                      <button key={t} type="button"
                        onClick={() => setSelectedTemas((prev) => toggle(prev, t))}
                        disabled={!active && count === 0}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition",
                          active ? "bg-slate-50 dark:bg-slate-800/50" : "hover:bg-slate-50 dark:hover:bg-slate-800/30",
                          !active && count === 0 && "cursor-not-allowed opacity-40"
                        )}>
                        <span className="min-w-0 truncate font-medium text-slate-800 dark:text-slate-200">
                          {t} <span className="text-slate-400 dark:text-slate-500">({count})</span>
                        </span>
                        <span className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
                          active
                            ? "bg-blue-500 text-white"
                            : count === 0
                            ? "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-600"
                            : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                        )}>
                          {active ? "✓" : count === 0 ? "—" : "Selecionar"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="px-4 py-6 text-center text-sm text-slate-400 dark:text-slate-500">
                  Nenhum tema encontrado.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tags dos temas selecionados */}
        {selectedTemas.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {selectedTemas.map((t) => (
              <span key={t}
                className="inline-flex items-center gap-1.5 rounded-full border border-blue-400/60 bg-blue-500 px-3 py-1 text-xs font-semibold text-white">
                <span className="max-w-[200px] truncate">{t}</span>
                <button type="button" onClick={() => setSelectedTemas((prev) => prev.filter((x) => x !== t))}
                  className="shrink-0 opacity-80 hover:opacity-100" aria-label={`Remover ${t}`}>
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* BARRA FIXA NO RODAPÉ */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800/80 dark:bg-[#030b21]/95">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-10">
          <div className="min-w-0">
            <div className="text-sm font-black text-slate-900 dark:text-slate-100">
              {availableCount > 0 ? (
                <>
                  <span className="text-blue-600 dark:text-blue-400">{effectiveQuestionCount}</span> questão(ões)
                </>
              ) : (
                <span className="text-rose-500">Sem questões disponíveis</span>
              )}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {availableCount > 0
                ? `${availableCount} disponíveis com os filtros${hasFilters ? " selecionados" : ""}`
                : "Ajuste os filtros para continuar"}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {hasFilters && (
              <button type="button"
                onClick={() => { setSelectedProvas([]); setSelectedNiveis([]); setSelectedTemas([]); }}
                className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100">
                <Filter size={13} />
                Limpar filtros
              </button>
            )}
            <Button onClick={createSimulado} disabled={!canCreate} className="gap-2 px-6">
              <Zap size={14} />
              {creating ? "Criando…" : "Criar simulado"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
