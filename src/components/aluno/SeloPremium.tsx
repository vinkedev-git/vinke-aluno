"use client";
// Durante o Vinke aberto, avisa que o recurso é premium e está liberado só até
// 31/1 — para o aluno aprender o que é pago antes de o limite voltar.
// Fora do período (ou para quem paga) não renderiza nada.
import Link from "next/link";
import { usePlano } from "@/lib/plano";
import { VINKE_ABERTO_FIM_LABEL } from "@/lib/oferta-client";

export default function SeloPremium({ recurso }: { recurso: string }) {
  const plano = usePlano();
  if (!plano.aberto) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-vinke/30 bg-vinke-soft px-4 py-2.5 text-[13px] dark:bg-vinke/10">
      <span className="rounded-full bg-vinke px-2 py-0.5 text-[10px] font-bold tracking-[0.12em] text-white">PREMIUM</span>
      <span className="font-semibold text-vinke-ink dark:text-white">
        {recurso} é premium e está liberado para você até {VINKE_ABERTO_FIM_LABEL}.
      </span>
      <Link href="/aluno/planos" className="font-semibold text-vinke underline-offset-2 hover:underline dark:text-vinke-lav">
        ver planos
      </Link>
    </div>
  );
}
