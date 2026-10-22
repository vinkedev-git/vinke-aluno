"use client";
// Muro do plano gratuito com oferta direta: mostra o que o aluno fez hoje
// (acertos, erros, tema que mais pesou) e o Passe Reta Final com checkout em
// um clique, e-mail já preenchido. Depois do ENEM, oferece o Anual.
//
// Mede o funil em users/{uid}/meta/funil (muroVisto, muroCliques) e dispara
// ViewContent no Pixel; o InitiateCheckout sai sozinho no clique (MetaPixel.tsx).

import { useEffect, useMemo, useState } from "react";
import { doc, getDoc, setDoc, increment, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { track } from "@/components/MetaPixel";
import { ofertaAtual, checkoutUrl, LP_PLANOS_URL, LIMITE_LABEL } from "@/lib/oferta-client";

type Stats = {
  todayAnswered: number;
  todayCorrect: number;
  piorTema: string | null;
  erros: number;
};

function useResumoHoje(): Stats | null {
  const [s, setS] = useState<Stats | null>(null);
  useEffect(() => {
    const u = auth.currentUser;
    if (!u) return;
    let alive = true;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "users", u.uid, "meta", "stats"));
        const d = (snap.data() ?? {}) as Record<string, unknown>;
        const byTheme = (d.byTheme ?? {}) as Record<string, { total?: number; correct?: number }>;
        let pior: string | null = null;
        let piorErros = 0;
        for (const [tema, v] of Object.entries(byTheme)) {
          const e = Number(v?.total ?? 0) - Number(v?.correct ?? 0);
          if (e > piorErros) {
            piorErros = e;
            pior = tema;
          }
        }
        const ta = Number(d.todayAnswered ?? 0);
        const tc = Number(d.todayCorrect ?? 0);
        if (alive) setS({ todayAnswered: ta, todayCorrect: tc, piorTema: pior, erros: Math.max(0, ta - tc) });
      } catch {
        if (alive) setS({ todayAnswered: 0, todayCorrect: 0, piorTema: null, erros: 0 });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  return s;
}

function registrarFunil(campo: "muroVisto" | "muroCliques", origem: string) {
  const u = auth.currentUser;
  if (!u) return;
  setDoc(
    doc(db, "users", u.uid, "meta", "funil"),
    { [campo]: increment(1), ultimaOrigem: origem, updatedAt: serverTimestamp() },
    { merge: true }
  ).catch(() => {});
}

export default function MuroPasse({
  origem,
  titulo,
  compacto = false,
}: {
  /** de onde o muro foi mostrado: "quiz" | "simulado" | "dashboard" | "caderno" | "estudo" */
  origem: string;
  /** título opcional por cima do resumo (ex.: "Você usou suas 10 questões de hoje") */
  titulo?: string;
  /** versão em faixa, para dentro do quiz */
  compacto?: boolean;
}) {
  const oferta = useMemo(() => ofertaAtual(), []);
  const resumo = useResumoHoje();
  const u = auth.currentUser;
  const url = checkoutUrl(oferta.url, { email: u?.email, nome: u?.displayName, origem });

  useEffect(() => {
    registrarFunil("muroVisto", origem);
    track("ViewContent", { content_name: `muro-${oferta.plano}`, content_category: origem });
  }, [origem, oferta.plano]);

  const onClick = () => registrarFunil("muroCliques", origem);

  const resumoLinha =
    resumo && resumo.todayAnswered > 0
      ? `Hoje: ${resumo.todayCorrect} de ${resumo.todayAnswered} certas` +
        (resumo.piorTema ? ` · onde você mais erra: ${resumo.piorTema}` : "")
      : null;

  if (compacto) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-vinke-line bg-vinke-soft p-5 dark:border-vinke-navy-line dark:bg-vinke/10">
        {titulo && <div className="text-sm font-bold text-vinke-ink dark:text-white">{titulo}</div>}
        {resumoLinha && <div className="text-xs font-semibold text-vinke-ink3 dark:text-slate-300">{resumoLinha}</div>}
        <div className="text-sm font-semibold text-vinke-ink dark:text-white">
          {oferta.titulo}. {oferta.detalhe}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <a
            href={url}
            onClick={onClick}
            className="rounded-[10px] bg-vinke px-4 py-2.5 text-center text-xs font-bold text-white transition hover:bg-vinke-deep"
          >
            {oferta.cta}
          </a>
          <a href={LP_PLANOS_URL} target="_blank" rel="noreferrer" className="text-xs font-semibold text-vinke-ink3 underline-offset-2 hover:underline">
            ver mensal e anual
          </a>
        </div>
        <span className="text-[11px] text-vinke-ink4">{LIMITE_LABEL}</span>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[560px] flex-col items-center gap-4 rounded-3xl border border-vinke-line bg-white p-8 text-center shadow-sm sm:p-10 dark:border-vinke-navy-line dark:bg-vinke-navy-card">
      {titulo && <h2 className="font-display text-xl font-bold text-vinke-ink dark:text-white">{titulo}</h2>}
      {resumoLinha && (
        <div className="w-full rounded-2xl bg-vinke-soft px-4 py-3 text-sm font-semibold text-vinke-ink dark:bg-vinke/10 dark:text-white">
          {resumoLinha}
        </div>
      )}
      <div className="font-display text-2xl font-bold text-vinke dark:text-vinke-lav">{oferta.titulo}</div>
      <p className="text-sm leading-6 text-vinke-ink3 dark:text-slate-300">{oferta.detalhe}</p>
      <a
        href={url}
        onClick={onClick}
        className="mt-1 w-full rounded-[10px] bg-vinke px-6 py-3 text-sm font-bold text-white shadow-[0_18px_40px_rgba(98,54,240,0.28)] transition hover:bg-vinke-deep sm:w-auto"
      >
        {oferta.cta}
      </a>
      <a href={LP_PLANOS_URL} target="_blank" rel="noreferrer" className="text-xs font-semibold text-vinke-ink3 underline-offset-2 hover:underline">
        ver planos mensal e anual
      </a>
      <span className="text-xs font-medium text-vinke-ink4">{LIMITE_LABEL}</span>
    </div>
  );
}
