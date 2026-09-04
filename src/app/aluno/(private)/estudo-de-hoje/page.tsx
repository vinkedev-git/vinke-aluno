import EstudoDeHojeClient from "./estudo-de-hoje-client";
import { GatePlanoPago } from "@/components/aluno/UpsellPlano";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <GatePlanoPago
      titulo="O plano diário adaptativo é do plano pago"
      descricao="Ele usa seu desempenho para decidir o que você deve treinar hoje — questões, revisão de erros e prioridades por assunto. No plano gratuito, você tem 10 questões por dia e a questão do dia."
    >
      <EstudoDeHojeClient />
    </GatePlanoPago>
  );
}
