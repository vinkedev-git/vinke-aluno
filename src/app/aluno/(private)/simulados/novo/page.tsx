import { Suspense } from "react";
import NovoSimuladoClient from "./novo-simulado-client";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <NovoSimuladoClient />
    </Suspense>
  );
}
