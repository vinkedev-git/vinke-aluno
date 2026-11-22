"use client";
// Oferta Anual Fundador (12x R$ 14,90 até 31/01/2027; os 12 meses contam a
// partir de 1º/02/2027). Só aparece com o checkout configurado e dentro do prazo.
//  - <OfertaFundador origem="planos" />: card na página Planos.
//  - <CardFundadorInicio />: no início, só para quem já usou de verdade
//    (30+ questões ou sequência de 3+ dias); o aluno fecha no × e não volta.
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, increment, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { usePlano } from "@/lib/plano";
import { CHECKOUT, PRECO, checkoutUrl, diasParaFimFundador, fundadorAtivo } from "@/lib/oferta-client";
import { useDentroDoApp } from "@/lib/app-nativo";

function registrarClique(origem: string) {
  const u = auth.currentUser;
  if (!u) return;
  setDoc(
    doc(db, "users", u.uid, "meta", "funil"),
    { muroCliques: increment(1), fundadorCliques: increment(1), ultimaOrigem: `fundador-${origem}`, updatedAt: serverTimestamp() },
    { merge: true }
  ).catch(() => {});
}

function prazoTexto() {
  const d = diasParaFimFundador();
  return d <= 1 ? "Termina hoje" : `Até 31 de janeiro · faltam ${d} dias`;
}

export default function OfertaFundador({ origem }: { origem: string }) {
  const noApp = useDentroDoApp();
  if (!fundadorAtivo() || noApp) return null;
  const u = auth.currentUser;
  const url = checkoutUrl(CHECKOUT.fundador, { email: u?.email, nome: u?.displayName, origem: `fundador-${origem}` });
  return (
    <div className="flex flex-col gap-4 rounded-2xl border-[1.5px] border-vinke bg-white p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6 dark:bg-vinke-navy-card">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-vinke px-2.5 py-0.5 text-[10px] font-bold tracking-[0.12em] text-white">ANUAL FUNDADOR</span>
          <span className="text-[11px] font-semibold text-vinke-ink3">{prazoTexto()}</span>
        </div>
        <p className="mt-2 font-display text-xl font-bold text-vinke-ink dark:text-white">
          {PRECO.fundador} <span className="text-sm font-semibold text-vinke-ink3 line-through">12x R$ 19,90</span>
        </p>
        <p className="mt-1 max-w-[520px] text-sm leading-6 text-vinke-ink3 dark:text-slate-300">
          Os 12 meses só começam a contar em 1º de fevereiro: você não perde o período grátis, e o acesso vai até 31/01/2028,
          cobrindo o ENEM 2027 inteiro. Em fevereiro o Anual volta para 12x R$ 19,90.
        </p>
      </div>
      <a
        href={url}
        onClick={() => registrarClique(origem)}
        className="shrink-0 rounded-[10px] bg-vinke px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-vinke-deep"
      >
        Garantir o Fundador
      </a>
    </div>
  );
}

export function CardFundadorInicio() {
  const plano = usePlano();
  const noApp = useDentroDoApp();
  const [mostrar, setMostrar] = useState(false);

  useEffect(() => {
    if (!fundadorAtivo()) return;
    return onAuthStateChanged(auth, async (u) => {
      if (!u) return;
      try {
        const [st, av] = await Promise.all([
          getDoc(doc(db, "users", u.uid, "meta", "stats")),
          getDoc(doc(db, "users", u.uid, "meta", "avisos")),
        ]);
        const s = (st.data() ?? {}) as { totalAnswered?: unknown; longestStreak?: unknown };
        const engajado = Number(s.totalAnswered ?? 0) >= 30 || Number(s.longestStreak ?? 0) >= 3;
        setMostrar(engajado && !av.data()?.fundadorFechadoEm);
      } catch {
        setMostrar(false);
      }
    });
  }, []);

  // só para o plano grátis (dentro ou fora do período aberto); nunca no app
  if (noApp || !mostrar || plano.carregando || (!plano.aberto && !plano.gratuito)) return null;

  const fechar = () => {
    setMostrar(false);
    const u = auth.currentUser;
    if (u) setDoc(doc(db, "users", u.uid, "meta", "avisos"), { fundadorFechadoEm: serverTimestamp() }, { merge: true }).catch(() => {});
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={fechar}
        aria-label="Fechar oferta"
        className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-full text-lg leading-none text-vinke-ink3 transition hover:bg-vinke-soft"
      >
        ×
      </button>
      <OfertaFundador origem="inicio" />
    </div>
  );
}
