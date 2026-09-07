"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  doc,
  getCountFromServer,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { SkeletonList } from "@/components/ui/skeleton";
import { usePlano, simuladoDoMesJaUsado, brtMesKey } from "@/lib/plano";
import { AvisoLimitePlano } from "@/components/aluno/UpsellPlano";

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

type YearRow = {
  year: number;
  total: number;
  answered: number;
  correct: number;
};

type SessionLike = {
  answersMap?: Record<string, { isCorrect?: boolean }>;
};

const ANO_MIN = 2009;
const ANO_MAX = 2035; // sondamos até não achar mais

export default function ProvasPageClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [rows, setRows] = useState<YearRow[]>([]);
  const [creating, setCreating] = useState<number | null>(null);
  const plano = usePlano();
  const [limiteMensalAtingido, setLimiteMensalAtingido] = useState(false);

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
      // 1. respostas do aluno agrupadas por prova (ids ENEM{ano}_Qxxx)
      const sessSnap = await getDocs(collection(db, "users", u.uid, "sessions"));
      const byYear = new Map<number, { answered: Set<string>; correct: Set<string> }>();
      sessSnap.docs.forEach((d) => {
        const answers = (d.data() as SessionLike).answersMap ?? {};
        for (const [qid, ans] of Object.entries(answers)) {
          const m = qid.match(/^ENEM(\d{4})_/);
          if (!m || !ans || typeof ans !== "object") continue;
          const year = Number(m[1]);
          const agg = byYear.get(year) ?? { answered: new Set(), correct: new Set() };
          agg.answered.add(qid);
          if (ans.isCorrect) agg.correct.add(qid);
          byYear.set(year, agg);
        }
      });

      // 2. total de questões por ano no banco
      const anos: YearRow[] = [];
      const counts = await Promise.all(
        Array.from({ length: ANO_MAX - ANO_MIN + 1 }, (_, i) => ANO_MIN + i).map(async (year) => {
          try {
            const c = await getCountFromServer(
              query(collection(db, "questionsBank"), where("examYear", "==", year))
            );
            return { year, total: c.data().count };
          } catch {
            return { year, total: 0 };
          }
        })
      );
      for (const { year, total } of counts) {
        if (total === 0) continue;
        const agg = byYear.get(year);
        anos.push({
          year,
          total,
          answered: agg?.answered.size ?? 0,
          correct: agg?.correct.size ?? 0,
        });
      }
      anos.sort((a, b) => b.year - a.year);
      setRows(anos);
    } catch (error) {
      console.error(error);
      setErr(error instanceof Error ? error.message : "Falha ao carregar as provas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totalDisponiveis = useMemo(() => rows.reduce((a, r) => a + r.total, 0), [rows]);

  async function resolverProva(year: number) {
    const u = auth.currentUser;
    if (!u || creating != null) return;
    setCreating(year);
    try {
      // Plano gratuito: resolver uma prova completa conta como o simulado do mês
      if (plano.gratuito && (await simuladoDoMesJaUsado(u.uid))) {
        setLimiteMensalAtingido(true);
        setCreating(null);
        return;
      }
      const qSnap = await getDocs(
        query(collection(db, "questionsBank"), where("examYear", "==", year))
      );
      const questions = qSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as { isActive?: boolean; enemIndex?: number }) }))
        .filter((q) => q.isActive !== false)
        .sort((a, b) => (a.enemIndex ?? 0) - (b.enemIndex ?? 0));
      const questionIds = questions.map((q) => q.id);
      if (!questionIds.length) return;

      const ref = doc(collection(db, "users", u.uid, "sessions"));
      const batch = writeBatch(db);
      batch.set(ref, {
        title: `Prova completa • ENEM ${year}`,
        titleDisplay: `Prova completa · ENEM ${year}`,
        kind: "prova_oficial",
        status: "in_progress",
        filters: {
          anos: [String(year)],
          areas: [],
          assuntos: [],
          provas: [`ENEM ${year}`],
          niveis: [],
          temas: [],
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
      // Gratuito: virada do mês no contador no mesmo batch (regra do servidor)
      if (plano.gratuito) {
        batch.set(doc(db, "users", u.uid, "meta", "planUso"), { simuladoMes: brtMesKey() }, { merge: true });
      }
      await batch.commit();
      router.push(`/aluno/simulados/${ref.id}`);
    } catch (e) {
      console.error(e);
      if (plano.gratuito && (e as { code?: string })?.code === "permission-denied") {
        setLimiteMensalAtingido(true);
      }
    } finally {
      setCreating(null);
    }
  }

  return (
    <div className="space-y-4 pb-6">
      {/* Header */}
      <div className="flex flex-col gap-0.5">
        <span className="font-display text-2xl font-bold text-vinke-ink dark:text-white">
          Provas ENEM
        </span>
        <span className="text-xs font-medium text-vinke-ink3">
          As provas oficiais, completas ou por área.
          {totalDisponiveis ? ` ${totalDisponiveis.toLocaleString("pt-BR")} questões no banco.` : ""}
        </span>
      </div>

      {limiteMensalAtingido && (
        <AvisoLimitePlano
          titulo="Você já usou o simulado deste mês"
          descricao="No plano gratuito, resolver uma prova completa usa o seu simulado mensal. Assine para treinar sem limites."
        />
      )}

      {err ? (
        <div className="flex flex-col gap-2 rounded-2xl bg-vinke-red-soft p-5 dark:bg-vinke-red/10">
          <span className="text-sm font-semibold text-vinke-red dark:text-vinke-red-dark">{err}</span>
          <button
            type="button"
            onClick={() => void load()}
            className="self-start rounded-[8px] border-[1.5px] border-vinke-red px-4 py-2 text-xs font-bold text-vinke-red"
          >
            Tentar novamente
          </button>
        </div>
      ) : null}

      {loading ? <SkeletonList rows={5} /> : null}

      {!loading && !err && rows.length === 0 ? (
        <div className="rounded-2xl border-[1.5px] border-dashed border-vinke-line bg-white px-6 py-12 text-center dark:border-vinke-navy-line dark:bg-vinke-navy-card">
          <div className="font-display text-base font-bold text-vinke-ink dark:text-white">
            As provas estão chegando
          </div>
          <div className="mt-1 text-sm text-vinke-ink3">
            As provas oficiais do ENEM aparecem aqui assim que forem adicionadas ao banco.
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2.5">
        {rows.map((r) => {
          const pct = r.total > 0 ? Math.round((r.answered / r.total) * 100) : 0;
          const complete = r.total > 0 && r.answered >= r.total;
          const acerto = r.answered > 0 ? Math.round((r.correct / r.answered) * 100) : null;
          const started = r.answered > 0;
          const isCreating = creating === r.year;

          return (
            <div
              key={r.year}
              className="flex flex-col gap-3 rounded-[14px] bg-white p-4 sm:flex-row sm:items-center sm:gap-4 sm:px-5 dark:border dark:border-vinke-navy-line dark:bg-vinke-navy-card"
            >
              <span className="w-14 shrink-0 font-display text-xl font-bold text-vinke-ink dark:text-white">
                {r.year}
              </span>

              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex justify-between text-[10px] font-semibold text-vinke-ink3">
                  <span>
                    {started
                      ? complete
                        ? `${r.total} de ${r.total} · concluída`
                        : `${r.answered} de ${r.total} respondidas`
                      : "Ainda não começou"}
                  </span>
                  {acerto != null ? (
                    <span
                      className={cn(
                        "font-bold",
                        acerto >= 60 ? "text-vinke-green-text dark:text-vinke-green" : "text-vinke-ink2 dark:text-slate-300"
                      )}
                    >
                      {complete ? "✓ " : ""}
                      {acerto}% de acerto
                    </span>
                  ) : (
                    <span>{r.total} questões</span>
                  )}
                </div>
                <div className={cn("h-1.5 rounded-full", complete ? "bg-vinke-green-soft" : "bg-vinke-line2 dark:bg-vinke-navy-sel")}>
                  <div
                    className={cn("h-1.5 rounded-full", complete ? "bg-vinke-green" : "bg-vinke")}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => void resolverProva(r.year)}
                  disabled={creating != null}
                  className={cn(
                    "rounded-[8px] px-3.5 py-2 text-[11px] font-bold transition disabled:opacity-60",
                    started && !complete
                      ? "bg-vinke text-white hover:bg-vinke-deep"
                      : complete
                        ? "border-[1.5px] border-vinke-line text-vinke-ink hover:bg-vinke-offwhite dark:border-vinke-navy-line dark:text-slate-200 dark:hover:bg-vinke-navy-sel"
                        : "bg-vinke text-white hover:bg-vinke-deep"
                  )}
                >
                  {isCreating ? "Preparando…" : complete ? "Refazer" : started ? "Nova tentativa" : "Resolver"}
                </button>
                <button
                  type="button"
                  onClick={() => router.push(`/aluno/simulados/novo?ano=${r.year}`)}
                  className="text-[11px] font-bold text-vinke dark:text-vinke-lav"
                >
                  Por área ▾
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
