"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { addDoc, collection, getDocs, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { usePlano, simuladoDoMesJaUsado } from "@/lib/plano";
import { AvisoLimitePlano } from "@/components/aluno/UpsellPlano";
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

type AreaDoc = { id: string; nome: string; sigla?: string; ordem?: number };

type QuestionBankDoc = {
  id: string;
  isActive?: unknown;
  examType?: unknown;
  examYear?: unknown;
  prova_ano?: unknown;
  areaId?: unknown;
  disciplinaId?: unknown;
  disciplina?: unknown;
  level?: unknown;
  nivel?: unknown;
  themes?: unknown;
  assuntos?: unknown;
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

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}
function uniq(items: string[]) { return Array.from(new Set(items.filter(Boolean))); }

function extractAssuntos(q: QuestionBankDoc): string[] {
  return uniq([...toStringArray(q.assuntos), ...toStringArray(q.themes)]);
}
function extractYear(q: QuestionBankDoc): string {
  const y = q.examYear ?? q.prova_ano ?? "";
  const s = String(y ?? "").trim();
  return /^\d{4}$/.test(s) ? s : "";
}
function extractAreaId(q: QuestionBankDoc): string {
  return String(q.areaId ?? "").trim();
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
          ? "border-vinke bg-vinke text-white"
          : "border-vinke-line bg-white text-vinke-ink2 hover:border-vinke-ink4 hover:bg-vinke-offwhite dark:border-vinke-navy-line dark:bg-vinke-navy-card dark:text-slate-300 dark:hover:border-vinke-lav/40 dark:hover:bg-vinke-navy-sel",
        disabled && !active && "cursor-not-allowed opacity-40"
      )}
    >
      <span className="truncate">{label}</span>
      {count !== undefined && (
        <span className={cn("text-xs", active ? "opacity-70" : "text-vinke-ink4 dark:text-slate-500")}>
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

  const [areas, setAreas] = useState<AreaDoc[]>([]);
  const [assuntos, setAssuntos] = useState<string[]>([]);
  const [questionsPool, setQuestionsPool] = useState<QuestionBankDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [selectedAnos, setSelectedAnos] = useState<string[]>([]);
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [selectedAssuntos, setSelectedAssuntos] = useState<string[]>([]);
  const [qtd, setQtd] = useState<number>(10);
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const [themeQuery, setThemeQuery] = useState("");

  // Plano gratuito: 1 simulado por mês
  const plano = usePlano();
  const [limiteMensalAtingido, setLimiteMensalAtingido] = useState(false);
  useEffect(() => {
    if (!plano.gratuito || !user) return;
    void simuladoDoMesJaUsado(user.uid).then(setLimiteMensalAtingido).catch(() => {});
  }, [plano.gratuito, user]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        // Áreas oficiais do ENEM (taxonomia)
        const collectedAssuntos = new Set<string>();
        try {
          const taxSnap = await getDocs(collection(db, "taxonomia"));
          const areaDocs: AreaDoc[] = [];
          taxSnap.docs.forEach((d) => {
            const data = d.data() as { tipo?: string; nome?: string; sigla?: string; ordem?: number; ativo?: boolean };
            if (data.ativo === false) return;
            if (data.tipo === "area") {
              areaDocs.push({ id: d.id, nome: data.nome ?? d.id, sigla: data.sigla, ordem: data.ordem });
            } else if (data.tipo === "assunto" && data.nome) {
              collectedAssuntos.add(data.nome.trim());
            }
          });
          setAreas(areaDocs.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)));
        } catch { /* fallback abaixo */ }

        try {
          const qbSnap = await getDocs(collection(db, "questionsBank"));
          const pool: QuestionBankDoc[] = [];
          qbSnap.docs.forEach((d) => {
            const q = { id: d.id, ...(d.data() as Omit<QuestionBankDoc, "id">) };
            pool.push(q);
            extractAssuntos(q).forEach((t) => collectedAssuntos.add(t));
          });
          setQuestionsPool(pool);
        } catch { /* mantém assuntos */ }

        setAssuntos(Array.from(collectedAssuntos).sort((a, b) => a.localeCompare(b, "pt-BR")));
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  useEffect(() => {
    const rawQtd = Number(searchParams.get("qtd"));
    if ([10, 20, 30, 45, 90].includes(rawQtd)) setQtd(rawQtd);
  }, [searchParams]);

  useEffect(() => {
    const rawAssunto = (searchParams.get("assunto") || searchParams.get("tema") || "").trim();
    if (!rawAssunto || assuntos.length === 0) return;
    const matched = assuntos.find((t) => t.toLocaleLowerCase("pt-BR") === rawAssunto.toLocaleLowerCase("pt-BR"));
    if (!matched) return;
    setSelectedAssuntos((prev) => (prev.includes(matched) ? prev : [...prev, matched]));
  }, [searchParams, assuntos]);

  const anosDisponiveis = useMemo(() => {
    const anos = new Set<string>();
    questionsPool.forEach((q) => { const y = extractYear(q); if (y) anos.add(y); });
    return Array.from(anos).sort((a, b) => Number(b) - Number(a));
  }, [questionsPool]);

  useEffect(() => {
    const rawAno = (searchParams.get("ano") || "").trim();
    if (!rawAno || anosDisponiveis.length === 0) return;
    if (!anosDisponiveis.includes(rawAno)) return;
    setSelectedAnos((prev) => (prev.includes(rawAno) ? prev : [...prev, rawAno]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, anosDisponiveis]);

  const areaNome = (id: string) => areas.find((a) => a.id === id)?.nome ?? id;
  const areaCurta = (id: string) => {
    const nome = areaNome(id);
    return nome.split(",")[0].split(" e suas")[0];
  };

  const title = useMemo(() => {
    const anosLabel = selectedAnos.length ? selectedAnos.map((a) => `ENEM ${a}`).join(", ") : "Todas";
    const areasLabel = selectedAreas.length === 0 ? "Todas" : selectedAreas.map(areaCurta).join(", ");
    const assuntosLabel = selectedAssuntos.length === 0 ? "Todos" : selectedAssuntos.join(", ");
    return `Simulado • ${anosLabel} • ${areasLabel} • ${assuntosLabel}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAnos, selectedAreas, selectedAssuntos, areas]);

  const titleDisplay = useMemo(() => {
    const parts = title.split("•").map((p) => p.trim());
    const [main, ...rest] = parts;
    const cleaned = normalizeTitleParts(rest);
    return cleaned.length ? `${main} • ${cleaned.join(" • ")}` : main || "Simulado";
  }, [title]);

  const filteredAssuntos = useMemo(() => {
    const q = themeQuery.trim().toLowerCase();
    return q ? assuntos.filter((t) => t.toLowerCase().includes(q)) : assuntos;
  }, [assuntos, themeQuery]);

  const activeQuestions = useMemo(() => questionsPool.filter((q) => q.isActive !== false), [questionsPool]);

  function matchesFilters(
    q: QuestionBankDoc,
    { anos, areaIds, assuntosSelecionados }: { anos: string[]; areaIds: string[]; assuntosSelecionados: string[] }
  ) {
    if (anos.length > 0) {
      if (!anos.includes(extractYear(q))) return false;
    }
    if (areaIds.length > 0) {
      if (!areaIds.includes(extractAreaId(q))) return false;
    }
    if (assuntosSelecionados.length > 0) {
      const qAssuntos = extractAssuntos(q);
      if (!assuntosSelecionados.some((t) => qAssuntos.includes(t))) return false;
    }
    return true;
  }

  const availableQuestions = useMemo(
    () => activeQuestions.filter((q) => matchesFilters(q, { anos: selectedAnos, areaIds: selectedAreas, assuntosSelecionados: selectedAssuntos })),
    [activeQuestions, selectedAnos, selectedAreas, selectedAssuntos]
  );
  const availableCount = availableQuestions.length;
  const effectiveQuestionCount = Math.min(qtd, availableCount);

  const anoCounts = useMemo(() => Object.fromEntries(anosDisponiveis.map((ano) => [
    ano, activeQuestions.filter((q) => matchesFilters(q, { anos: [ano], areaIds: selectedAreas, assuntosSelecionados: selectedAssuntos })).length
  ])) as Record<string, number>, [anosDisponiveis, activeQuestions, selectedAreas, selectedAssuntos]);

  const areaCounts = useMemo(() => Object.fromEntries(areas.map((a) => [
    a.id, activeQuestions.filter((q) => matchesFilters(q, { anos: selectedAnos, areaIds: [a.id], assuntosSelecionados: selectedAssuntos })).length
  ])) as Record<string, number>, [areas, activeQuestions, selectedAnos, selectedAssuntos]);

  const assuntoCounts = useMemo(() => Object.fromEntries(assuntos.map((t) => [
    t, activeQuestions.filter((q) => matchesFilters(q, { anos: selectedAnos, areaIds: selectedAreas, assuntosSelecionados: [t] })).length
  ])) as Record<string, number>, [assuntos, activeQuestions, selectedAnos, selectedAreas]);

  async function pickQuestions(): Promise<QuestionBankDoc[]> {
    const source = questionsPool.length > 0 ? questionsPool
      : (await getDocs(collection(db, "questionsBank"))).docs.map((d) => ({ id: d.id, ...(d.data() as Omit<QuestionBankDoc, "id">) }));
    return shuffle(
      source
        .filter((q) => q.isActive !== false)
        .filter((q) => matchesFilters(q, { anos: selectedAnos, areaIds: selectedAreas, assuntosSelecionados: selectedAssuntos }))
    ).slice(0, qtd);
  }

  const createSimulado = async () => {
    if (!user) return;
    setCreating(true);
    try {
      // Revalida o limite na hora de criar (o estado pode estar defasado)
      if (plano.gratuito && (await simuladoDoMesJaUsado(user.uid))) {
        setLimiteMensalAtingido(true);
        return;
      }
      const selectedQuestions = await pickQuestions();
      const questionIds = selectedQuestions.map((q) => q.id);
      if (!questionIds.length) return;
      const sessionRef = await addDoc(collection(db, "users", user.uid, "sessions"), {
        title, titleDisplay, status: "in_progress",
        filters: {
          anos: selectedAnos,
          areas: selectedAreas,
          assuntos: selectedAssuntos,
          // chaves legadas para telas que ainda leem o formato antigo
          provas: selectedAnos.map((a) => `ENEM ${a}`),
          niveis: selectedAreas.map(areaCurta),
          temas: selectedAssuntos,
        },
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

  const canCreate = !creating && availableCount > 0 && !(plano.gratuito && limiteMensalAtingido);
  const hasFilters = selectedAnos.length > 0 || selectedAreas.length > 0 || selectedAssuntos.length > 0;

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-vinke-ink3">Criar</div>
          <div className="mt-0.5 font-display text-3xl font-bold text-vinke-ink dark:text-slate-100">Novo simulado</div>
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
        <div className="text-xs font-bold uppercase tracking-widest text-vinke-ink3">Criar</div>
        <div className="mt-0.5 font-display text-3xl font-bold text-vinke-ink dark:text-slate-100">Novo simulado</div>
        <div className="mt-1 text-sm text-vinke-ink3">
          Monte um treino do seu jeito: por ano de prova, área ou assunto.
        </div>
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

        {/* Ano da prova */}
        <div className="rounded-2xl border border-vinke-line/80 bg-white p-5 dark:border-vinke-navy-line dark:bg-vinke-navy-card">
          <div className="text-[11px] font-bold uppercase tracking-widest text-vinke-ink3">Prova</div>
          <div className="mt-0.5 font-display font-bold text-vinke-ink dark:text-slate-100">Ano do ENEM</div>
          <div className="mt-1 text-xs text-vinke-ink4">Sem filtro = todos os anos</div>
          <div className="mt-4 flex flex-wrap gap-2">
            {anosDisponiveis.length ? (
              anosDisponiveis.map((ano) => (
                <Pill key={ano} label={ano}
                  active={selectedAnos.includes(ano)}
                  disabled={!selectedAnos.includes(ano) && (anoCounts[ano] ?? 0) === 0}
                  onClick={() => setSelectedAnos((prev) => toggle(prev, ano))} />
              ))
            ) : (
              <div className="text-xs text-vinke-ink4">As provas aparecem aqui conforme o banco cresce.</div>
            )}
          </div>
        </div>

        {/* Área do conhecimento */}
        <div className="rounded-2xl border border-vinke-line/80 bg-white p-5 dark:border-vinke-navy-line dark:bg-vinke-navy-card">
          <div className="text-[11px] font-bold uppercase tracking-widest text-vinke-ink3">Área</div>
          <div className="mt-0.5 font-display font-bold text-vinke-ink dark:text-slate-100">Área do conhecimento</div>
          <div className="mt-1 text-xs text-vinke-ink4">Sem filtro = todas as áreas</div>
          <div className="mt-4 flex flex-wrap gap-2">
            {areas.map((a) => (
              <Pill key={a.id} label={a.sigla ? `${a.sigla} · ${areaCurta(a.id)}` : areaCurta(a.id)}
                active={selectedAreas.includes(a.id)}
                disabled={!selectedAreas.includes(a.id) && (areaCounts[a.id] ?? 0) === 0}
                onClick={() => setSelectedAreas((prev) => toggle(prev, a.id))} />
            ))}
          </div>
        </div>

        {/* Quantidade */}
        <div className="rounded-2xl border border-vinke-line/80 bg-white p-5 dark:border-vinke-navy-line dark:bg-vinke-navy-card">
          <div className="text-[11px] font-bold uppercase tracking-widest text-vinke-ink3">Qtd</div>
          <div className="mt-0.5 font-display font-bold text-vinke-ink dark:text-slate-100">Questões</div>
          <div className="mt-1 text-xs text-vinke-ink4">45 = uma área completa · 90 = um dia de prova</div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {[10, 20, 45, 90].map((n) => (
              <button key={n} type="button" onClick={() => setQtd(n)}
                className={cn(
                  "rounded-2xl border px-4 py-3 text-sm font-semibold transition",
                  qtd === n
                    ? "border-vinke bg-vinke text-white"
                    : "border-vinke-line bg-white text-vinke-ink2 hover:border-vinke-ink4 hover:bg-vinke-offwhite dark:border-vinke-navy-line dark:bg-vinke-navy-card dark:text-slate-300 dark:hover:bg-vinke-navy-sel"
                )}>
                {n} questões
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Assuntos */}
      <div className="rounded-2xl border border-vinke-line/80 bg-white p-5 dark:border-vinke-navy-line dark:bg-vinke-navy-card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-vinke-ink3">Filtro</div>
            <div className="mt-0.5 font-display font-bold text-vinke-ink dark:text-slate-100">Assuntos</div>
            <div className="mt-1 text-xs text-vinke-ink4">
              Dica: escolha 1–3 assuntos para um treino direcionado.
            </div>
          </div>
          {selectedAssuntos.length > 0 && (
            <button type="button" onClick={() => { setSelectedAssuntos([]); setThemeQuery(""); }}
              className="shrink-0 text-xs font-semibold text-vinke-ink3 transition hover:text-vinke-ink dark:hover:text-slate-100">
              Limpar assuntos
            </button>
          )}
        </div>

        {/* Toggle dropdown */}
        <button type="button" onClick={() => setThemePickerOpen((v) => !v)}
          className="mt-4 flex w-full items-center justify-between rounded-2xl border border-vinke-line bg-vinke-offwhite px-4 py-3 text-sm font-semibold text-vinke-ink transition hover:bg-vinke-line2 dark:border-vinke-navy-line dark:bg-vinke-navy dark:text-slate-200 dark:hover:bg-vinke-navy-sel">
          <span>{selectedAssuntos.length > 0 ? `${selectedAssuntos.length} assunto(s) selecionado(s)` : "Selecionar assuntos"}</span>
          {themePickerOpen ? <ChevronUp size={16} className="text-vinke-ink4" /> : <ChevronDown size={16} className="text-vinke-ink4" />}
        </button>

        {themePickerOpen && (
          <div className="mt-2 rounded-2xl border border-vinke-line bg-white dark:border-vinke-navy-line dark:bg-vinke-navy-card">
            <div className="border-b border-vinke-line2 p-3 dark:border-vinke-navy-line">
              <input type="text" value={themeQuery} onChange={(e) => setThemeQuery(e.target.value)}
                placeholder="Buscar assunto…" className="ui-input" />
            </div>
            <div className="max-h-64 overflow-y-auto">
              {filteredAssuntos.length ? (
                <div className="divide-y divide-vinke-line3 dark:divide-vinke-navy-line/60">
                  {filteredAssuntos.map((t) => {
                    const active = selectedAssuntos.includes(t);
                    const count = assuntoCounts[t] ?? 0;
                    return (
                      <button key={t} type="button"
                        onClick={() => setSelectedAssuntos((prev) => toggle(prev, t))}
                        disabled={!active && count === 0}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition",
                          active ? "bg-vinke-sel dark:bg-vinke-navy-sel/60" : "hover:bg-vinke-offwhite dark:hover:bg-vinke-navy-sel/40",
                          !active && count === 0 && "cursor-not-allowed opacity-40"
                        )}>
                        <span className="min-w-0 truncate font-medium text-vinke-ink dark:text-slate-200">
                          {t} <span className="text-vinke-ink4 dark:text-slate-500">({count})</span>
                        </span>
                        <span className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
                          active
                            ? "bg-vinke text-white"
                            : count === 0
                            ? "bg-vinke-line2 text-vinke-ink4 dark:bg-vinke-navy dark:text-slate-600"
                            : "bg-vinke-line2 text-vinke-ink3 dark:bg-vinke-navy dark:text-slate-400"
                        )}>
                          {active ? "✓" : count === 0 ? "—" : "Selecionar"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="px-4 py-6 text-center text-sm text-vinke-ink4">
                  Nenhum assunto encontrado.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tags dos assuntos selecionados */}
        {selectedAssuntos.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {selectedAssuntos.map((t) => (
              <span key={t}
                className="inline-flex items-center gap-1.5 rounded-full bg-vinke px-3 py-1 text-xs font-semibold text-white">
                <span className="max-w-[200px] truncate">{t}</span>
                <button type="button" onClick={() => setSelectedAssuntos((prev) => prev.filter((x) => x !== t))}
                  className="shrink-0 opacity-80 hover:opacity-100" aria-label={`Remover ${t}`}>
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {plano.gratuito && limiteMensalAtingido && (
        <div className="mt-6">
          <AvisoLimitePlano
            titulo="Você já usou o simulado deste mês"
            descricao="O plano gratuito inclui 1 simulado por mês. Assine para criar simulados ilimitados."
          />
        </div>
      )}

      {/* BARRA FIXA NO RODAPÉ */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-vinke-line bg-white/95 backdrop-blur dark:border-vinke-navy-line dark:bg-vinke-navy/95">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-10">
          <div className="min-w-0">
            <div className="text-sm font-bold text-vinke-ink dark:text-slate-100">
              {availableCount > 0 ? (
                <>
                  <span className="text-vinke dark:text-vinke-lav">{effectiveQuestionCount}</span> questão(ões)
                </>
              ) : (
                <span className="text-vinke-red dark:text-vinke-red-dark">Sem questões disponíveis</span>
              )}
            </div>
            <div className="text-xs text-vinke-ink3">
              {availableCount > 0
                ? `${availableCount} disponíveis com os filtros${hasFilters ? " selecionados" : ""}`
                : "Ajuste os filtros para continuar"}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {hasFilters && (
              <button type="button"
                onClick={() => { setSelectedAnos([]); setSelectedAreas([]); setSelectedAssuntos([]); }}
                className="flex items-center gap-1.5 text-sm font-semibold text-vinke-ink3 transition hover:text-vinke-ink dark:hover:text-slate-100">
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
