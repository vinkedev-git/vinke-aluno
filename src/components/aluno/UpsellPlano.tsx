"use client";
// Bloqueio de recurso pago para quem está no plano gratuito.
// Usado como página inteira (estudo de hoje, caderno) e como aviso inline
// (limite de questões/simulados atingido). Os dois renderizam o MuroPasse,
// que traz o resumo do dia e a oferta com checkout direto.
import { usePlano } from "@/lib/plano";
import MuroPasse from "@/components/aluno/MuroPasse";

/**
 * Envolve uma página que é exclusiva de plano pago: mostra o upsell para
 * quem está no gratuito e o conteúdo normal para os demais.
 */
export function GatePlanoPago({
  titulo,
  descricao,
  children,
  origem = "gate",
}: {
  titulo: string;
  descricao: string;
  children: React.ReactNode;
  origem?: string;
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
        <UpsellPlano titulo={titulo} descricao={descricao} origem={origem} />
      </div>
    );
  }
  return <>{children}</>;
}

export function UpsellPlano({
  titulo,
  descricao,
  origem = "gate",
}: {
  titulo: string;
  descricao: string;
  origem?: string;
}) {
  return <MuroPasse origem={origem} titulo={`${titulo} — ${descricao}`} />;
}

export function AvisoLimitePlano({
  titulo,
  origem = "limite",
}: {
  titulo: string;
  descricao?: string;
  origem?: string;
}) {
  return <MuroPasse origem={origem} titulo={titulo} compacto />;
}
