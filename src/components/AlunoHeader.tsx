"use client";

import { useMemo } from "react";
import { auth } from "@/lib/firebase";

export default function AlunoHeader() {
  const name = useMemo(() => {
    const email = auth.currentUser?.email;
    return email ? email.split("@")[0] : "";
  }, []);

  return (
    <header className="bg-white border-b px-8 py-4 flex items-center justify-between">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">
          Bem-vindo, {name} 👋
        </h1>
        <p className="text-sm text-slate-500">
          Acesso liberado — Área do Aluno
        </p>
      </div>
    </header>
  );
}
