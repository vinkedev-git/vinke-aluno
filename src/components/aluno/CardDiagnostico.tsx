"use client";
// Card do início para quem ainda não concluiu o diagnóstico (alunos novos e
// a base que entrou antes de ele existir). Some depois de concluído.
import { useEffect, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { lerDiagnostico, type EstadoDiagnostico } from "@/lib/diagnostico";

export default function CardDiagnostico() {
  const [estado, setEstado] = useState<EstadoDiagnostico | undefined>(undefined);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      if (!u) return;
      try {
        setEstado(await lerDiagnostico(u.uid));
      } catch {
        setEstado(undefined); // em erro, não mostra nada
      }
    });
  }, []);

  if (estado === undefined || estado?.concluido) return null;
  const emAndamento = Boolean(estado?.sessionId);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-vinke bg-vinke-soft p-5 sm:flex-row sm:items-center sm:justify-between dark:bg-vinke/10">
      <div>
        <span className="text-[10px] font-bold tracking-[0.14em] text-vinke dark:text-vinke-lav">PRIMEIRO PASSO</span>
        <p className="mt-1 font-display text-lg font-bold leading-tight text-vinke-ink dark:text-white">
          {emAndamento ? "Termine seu diagnóstico" : "Descubra onde você está em 10 questões"}
        </p>
        <p className="mt-1 text-sm leading-5 text-vinke-ink3 dark:text-slate-300">
          Questões das quatro áreas mostram seu acerto por área e o que treinar primeiro.
        </p>
      </div>
      <Link
        href="/aluno/diagnostico"
        className="shrink-0 rounded-xl bg-vinke px-4 py-2.5 text-center text-sm font-bold text-white transition hover:bg-vinke-deep"
      >
        {emAndamento ? "Continuar" : "Fazer o diagnóstico"}
      </Link>
    </div>
  );
}
