import CadernoClient from "./caderno-client";
import { GatePlanoPago } from "@/components/aluno/UpsellPlano";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <GatePlanoPago
      titulo="O caderno de erros é do plano pago"
      descricao="Toda questão que você erra entra aqui automaticamente para revisão até virar acerto. Assine para destravar o caderno de erros e revisar exatamente o que te derruba."
    >
      <CadernoClient />
    </GatePlanoPago>
  );
}
