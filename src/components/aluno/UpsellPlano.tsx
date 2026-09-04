"use client";

// Bloqueio de recurso pago para quem está no plano gratuito.
// Usado como página inteira (estudo de hoje, caderno) e como aviso inline
// (limite de questões/simulados atingido).

import { Lock } from "lucide-react";
import { usePlano } from "@/lib/plano";

const LP_PLANOS_URL = "https://vinke-swart.vercel.app/#planos";

/**
 * Envolve uma página que é exclusiva de plano pago: mostra o upsell para
 * quem está no gratuito e o conteúdo normal para os demais.
 */
export function GatePlanoPago({
  titulo,
  descricao,
  children,
}: {
  titulo: string;
  descricao: string;
  children: React.ReactNode;
}) {
  const plano = usePlano();
  if (plano.carregando) {
    return (
      <div className="grid min-h-[40vh] place-items-center text-sm text-vinke-ink3">
        Carregando…
      </div>
    );
  }
  if (plano.gratuito) {
    return (
      <div className="py-10">
        <UpsellPlano titulo={titulo} descricao={descricao} />
      </div>
    );
  }
  return <>{children}</>;
}

export function UpsellPlano({
  titulo,
  descricao,
}: {
  titulo: string;
  descricao: string;
}) {
  return (
    <div className="mx-auto flex max-w-[560px] flex-col items-center gap-4 rounded-3xl border border-vinke-line bg-white p-8 text-center shadow-sm sm:p-10 dark:border-vinke-navy-line dark:bg-vinke-navy-card">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-vinke-soft text-vinke dark:bg-vinke/15 dark:text-vinke-lav">
        <Lock size={24} />
      </div>
      <h2 className="font-display text-xl font-bold text-vinke-ink dark:text-white">{titulo}</h2>
      <p className="text-sm leading-6 text-vinke-ink3 dark:text-slate-300">{descricao}</p>
      <a
        href={LP_PLANOS_URL}
        target="_blank"
        rel="noreferrer"
        className="mt-1 rounded-[10px] bg-vinke px-6 py-3 text-sm font-bold text-white shadow-[0_18px_40px_rgba(98,54,240,0.28)] transition hover:bg-vinke-deep"
      >
        Ver planos — a partir de R$ 19,90/mês
      </a>
      <span className="text-xs font-medium text-vinke-ink4">
        Garantia de 7 dias. Cancele quando quiser.
      </span>
    </div>
  );
}

export function AvisoLimitePlano({
  titulo,
  descricao,
}: {
  titulo: string;
  descricao: string;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl border border-vinke-line bg-vinke-soft p-5 sm:flex-row sm:items-center sm:justify-between dark:border-vinke-navy-line dark:bg-vinke/10">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-vinke dark:text-vinke-lav">
          <Lock size={18} />
        </span>
        <div>
          <div className="text-sm font-bold text-vinke-ink dark:text-white">{titulo}</div>
          <div className="text-xs font-medium text-vinke-ink3 dark:text-slate-300">{descricao}</div>
        </div>
      </div>
      <a
        href={LP_PLANOS_URL}
        target="_blank"
        rel="noreferrer"
        className="shrink-0 rounded-[10px] bg-vinke px-4 py-2.5 text-xs font-bold text-white transition hover:bg-vinke-deep"
      >
        Ver planos
      </a>
    </div>
  );
}
