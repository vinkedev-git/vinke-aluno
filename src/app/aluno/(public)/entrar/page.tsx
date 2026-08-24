// src/app/aluno/entrar/page.tsx
import { Suspense } from "react";
import LoginClient from "./login-client";

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
      <LoginClient />
    </Suspense>
  );
}