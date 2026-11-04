"use client";

import Link from "next/link";
import { VINKE_ABERTO_FIM_LABEL } from "@/lib/oferta-client";

/**
 * Faixa do Vinke aberto no dashboard do aluno gratuito: entre 16/11 e 31/1
 * tudo está liberado. Só aparece quando usePlano().aberto é true.
 */
export default function AvisoAberto() {
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-vinke-navy p-5 text-white sm:flex-row sm:items-center sm:justify-between">
      <div>
        <span className="inline-block rounded-full bg-[#6236F0] px-2.5 py-0.5 text-[11px] font-bold tracking-[0.12em]">
          VINKE ABERTO
        </span>
        <p className="mt-2 font-display text-lg font-bold leading-tight">
          Tudo liberado até {VINKE_ABERTO_FIM_LABEL}.
        </p>
        <p className="mt-1 text-sm leading-5 text-white/75">
          Questões sem limite, simulados completos, plano diário e caderno de erros. Grátis, sem cartão. A turma 2027 começa agora.
        </p>
      </div>
      <Link
        href="/aluno/simulados/novo"
        className="shrink-0 rounded-xl bg-white px-4 py-2.5 text-center text-sm font-bold text-vinke-navy transition hover:bg-white/90"
      >
        Fazer um simulado completo
      </Link>
    </div>
  );
}
