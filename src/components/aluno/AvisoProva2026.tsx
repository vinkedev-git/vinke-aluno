"use client";
// Aviso no início: a prova do ENEM 2026 (gabarito oficial de 18/11/2026) já
// está no Vinke, resolvida e comentada. Dois caminhos: a prova completa (tela
// Provas) ou um simulado montado só com questões de 2026. O aluno fecha no ×
// e o fechamento fica na conta (users/{uid}/meta/avisos), valendo em qualquer
// aparelho. Some sozinho em 1º/2/2027.
import { useEffect, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

const FIM = new Date("2027-02-01T00:00:00-03:00");

export default function AvisoProva2026() {
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    if (Date.now() >= FIM.getTime()) return;
    return onAuthStateChanged(auth, async (u) => {
      if (!u) return;
      try {
        const snap = await getDoc(doc(db, "users", u.uid, "meta", "avisos"));
        setVisivel(!snap.data()?.prova2026FechadoEm);
      } catch {
        setVisivel(true);
      }
    });
  }, []);

  const fechar = () => {
    setVisivel(false);
    const u = auth.currentUser;
    if (!u) return;
    setDoc(doc(db, "users", u.uid, "meta", "avisos"), { prova2026FechadoEm: serverTimestamp() }, { merge: true }).catch(() => {});
  };

  if (!visivel) return null;

  return (
    <div className="relative overflow-hidden rounded-2xl bg-vinke p-5 pr-12 text-white sm:p-6 sm:pr-14">
      <button
        type="button"
        onClick={fechar}
        aria-label="Fechar aviso"
        className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-lg leading-none text-white/80 transition hover:bg-white/15 hover:text-white"
      >
        ×
      </button>
      <span className="inline-block rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-bold tracking-[0.12em]">
        NOVO · ENEM 2026
      </span>
      <p className="mt-2 font-display text-xl font-bold leading-tight">A prova do ENEM 2026 já está no Vinke.</p>
      <p className="mt-1 max-w-[620px] text-sm leading-6 text-white/85">
        As questões dos dois dias, cada uma com resolução comentada. Fez a prova? Refaça e veja onde errou. Vai fazer em 2027?
        Comece pela prova mais recente. A questão 153 do caderno amarelo foi anulada pelo INEP.
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Link
          href="/aluno/provas"
          className="rounded-xl bg-white px-4 py-2.5 text-center text-sm font-bold text-vinke transition hover:bg-white/90"
        >
          Fazer a prova completa
        </Link>
        <Link
          href="/aluno/simulados/novo?ano=2026"
          className="rounded-xl border-[1.5px] border-white/50 px-4 py-2.5 text-center text-sm font-bold text-white transition hover:bg-white/10"
        >
          Montar simulado de 2026
        </Link>
      </div>
    </div>
  );
}
