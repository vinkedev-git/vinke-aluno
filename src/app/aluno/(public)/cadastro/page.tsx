import { Suspense } from "react";
import CadastroClient from "./cadastro-client";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">
          Carregando...
        </div>
      }
    >
      <CadastroClient />
    </Suspense>
  );
}
