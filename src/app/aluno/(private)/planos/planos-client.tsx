"use client";
// Planos dentro do app. Antes do período aberto: grátis × pago com checkout
// direto (e-mail pré-preenchido). Durante o Vinke aberto (16/11 a 31/1): mostra
// o que é premium e que está liberado, sem botão de compra (decisão: não vender
// no período; a condição de fundador vem depois).
import { useEffect } from "react";
import Link from "next/link";
import { doc, setDoc, increment, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { usePlano } from "@/lib/plano";
import { track } from "@/components/MetaPixel";
import { CHECKOUT, PRECO, checkoutUrl, ofertaAtual, VINKE_ABERTO_FIM_LABEL } from "@/lib/oferta-client";

const GRATIS = ["10 questões oficiais por dia", "1 simulado por semana", "Questão do dia e sequência", "Desempenho por área"];
const PREMIUM = [
  "Questões sem limite",
  "Simulados completos (45 e 90 questões) sem limite",
  "Estudo de hoje: plano diário montado com seus erros",
  "Caderno de erros com revisão diária",
  "759 flashcards por disciplina",
];

function Lista({ itens, ok }: { itens: string[]; ok: boolean }) {
  return (
    <ul className="space-y-2">
      {itens.map((t) => (
        <li key={t} className="flex items-start gap-2 text-sm text-vinke-ink2 dark:text-slate-200">
          <span className={ok ? "text-vinke dark:text-vinke-lav" : "text-vinke-ink4"}>{ok ? "✓" : "•"}</span>
          {t}
        </li>
      ))}
    </ul>
  );
}

export default function PlanosClient() {
  const plano = usePlano();
  const u = auth.currentUser;
  const oferta = ofertaAtual();
  const pago = !plano.carregando && !plano.gratuito && !plano.aberto;

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    setDoc(
      doc(db, "users", user.uid, "meta", "funil"),
      { planosVisto: increment(1), updatedAt: serverTimestamp() },
      { merge: true }
    ).catch(() => {});
    track("ViewContent", { content_name: "planos" });
  }, []);

  const link = (base: string) => checkoutUrl(base, { email: u?.email, nome: u?.displayName, origem: "planos" });
  const onClick = () => {
    const user = auth.currentUser;
    if (user)
      setDoc(doc(db, "users", user.uid, "meta", "funil"), { muroCliques: increment(1), ultimaOrigem: "planos", updatedAt: serverTimestamp() }, { merge: true }).catch(() => {});
  };

  if (plano.carregando) {
    return <div className="grid min-h-[40vh] place-items-center text-sm text-vinke-ink3">Carregando…</div>;
  }

  return (
    <div className="mx-auto max-w-[880px] space-y-6 py-2">
      <div>
        <div className="text-[11px] font-bold tracking-[0.18em] text-vinke dark:text-vinke-lav">PLANOS</div>
        <h1 className="mt-1 font-display text-2xl font-bold text-vinke-ink dark:text-white">
          {plano.aberto ? `Tudo liberado até ${VINKE_ABERTO_FIM_LABEL}` : pago ? "Você está no plano pago" : "O grátis te dá questões. O premium te diz quais."}
        </h1>
        <p className="mt-2 max-w-[640px] text-sm leading-6 text-vinke-ink3 dark:text-slate-300">
          {plano.aberto
            ? `Durante o Vinke aberto, os recursos premium estão liberados no seu plano grátis. Em fevereiro o grátis volta a ter 10 questões por dia, e quem treinar no período recebe uma condição especial para continuar.`
            : pago
              ? "Seu plano libera tudo abaixo. Vencimento e pagamento ficam em Assinatura."
              : "No grátis você treina todo dia. No premium, o Vinke usa seus erros para montar o que treinar e revisar."}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-3xl border border-vinke-line bg-white p-6 dark:border-vinke-navy-line dark:bg-vinke-navy-card">
          <div className="text-xs font-bold tracking-[0.12em] text-vinke-ink3">GRÁTIS</div>
          <div className="mt-1 font-display text-2xl font-bold text-vinke-ink dark:text-white">R$ 0</div>
          <div className="mt-4">
            <Lista itens={GRATIS} ok={false} />
          </div>
        </div>
        <div className="rounded-3xl border-[1.5px] border-vinke bg-vinke-soft p-6 dark:bg-vinke/10">
          <div className="flex items-center gap-2 text-xs font-bold tracking-[0.12em] text-vinke dark:text-vinke-lav">
            PREMIUM
            {plano.aberto && (
              <span className="rounded-full bg-vinke px-2 py-0.5 text-[10px] text-white">LIBERADO ATÉ {VINKE_ABERTO_FIM_LABEL.toUpperCase()}</span>
            )}
          </div>
          <div className="mt-1 font-display text-2xl font-bold text-vinke-ink dark:text-white">
            {PRECO.anual} <span className="text-sm font-semibold text-vinke-ink3">no Anual</span>
          </div>
          <div className="mt-4">
            <Lista itens={PREMIUM} ok />
          </div>
        </div>
      </div>

      {plano.aberto ? (
        <div className="flex flex-col gap-3 rounded-2xl bg-vinke-navy p-5 text-white sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-6 text-white/80">Aproveite: um simulado completo mostra onde você erra e monta seu caderno de erros sozinho.</p>
          <Link href="/aluno/simulados/novo" className="shrink-0 rounded-xl bg-white px-4 py-2.5 text-center text-sm font-bold text-vinke-navy">
            Fazer um simulado
          </Link>
        </div>
      ) : pago ? (
        <Link href="/aluno/assinatura" className="inline-block rounded-xl bg-vinke px-5 py-3 text-sm font-bold text-white">
          Ver minha assinatura
        </Link>
      ) : (
        <div className="space-y-3">
          {oferta.plano === "passe" && (
            <a
              href={link(CHECKOUT.passe)}
              onClick={onClick}
              className="flex flex-col gap-1 rounded-2xl border-[1.5px] border-vinke bg-white p-5 transition hover:bg-vinke-soft sm:flex-row sm:items-center sm:justify-between dark:bg-vinke-navy-card"
            >
              <span>
                <span className="block text-[11px] font-bold tracking-[0.12em] text-vinke dark:text-vinke-lav">{oferta.titulo.toUpperCase()}</span>
                <span className="font-display text-lg font-bold text-vinke-ink dark:text-white">Passe Reta Final · {PRECO.passe}</span>
                <span className="block text-xs text-vinke-ink3">Pagamento único, tudo liberado até 30/11.</span>
              </span>
              <span className="mt-2 rounded-[10px] bg-vinke px-4 py-2.5 text-center text-sm font-bold text-white sm:mt-0">Garantir o Passe</span>
            </a>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <a href={link(CHECKOUT.anual)} onClick={onClick} className="rounded-2xl border border-vinke-line bg-white p-5 transition hover:border-vinke dark:border-vinke-navy-line dark:bg-vinke-navy-card">
              <span className="block text-[11px] font-bold tracking-[0.12em] text-vinke dark:text-vinke-lav">MAIS ESCOLHIDO</span>
              <span className="font-display text-lg font-bold text-vinke-ink dark:text-white">Anual · {PRECO.anual}</span>
              <span className="block text-xs text-vinke-ink3">sem juros, ou R$ 238,80 à vista</span>
            </a>
            <a href={link(CHECKOUT.mensal)} onClick={onClick} className="rounded-2xl border border-vinke-line bg-white p-5 transition hover:border-vinke dark:border-vinke-navy-line dark:bg-vinke-navy-card">
              <span className="block text-[11px] font-bold tracking-[0.12em] text-vinke-ink3">MÊS A MÊS</span>
              <span className="font-display text-lg font-bold text-vinke-ink dark:text-white">Mensal · {PRECO.mensal}</span>
              <span className="block text-xs text-vinke-ink3">cancele quando quiser</span>
            </a>
          </div>
          <p className="text-xs text-vinke-ink4">Garantia de 7 dias em todos os planos. O acesso libera na hora, no e-mail desta conta.</p>
        </div>
      )}
    </div>
  );
}
