"use client";
// Popup "O Vinke ficou melhor": aparece UMA vez por aluno (na conta,
// users/{uid}/meta/avisos.novidades202611VistoEm, vale em qualquer aparelho)
// e é marcado como visto assim que aparece, mesmo se o aluno não clicar.
// Não aparece:
//  - para quem criou a conta depois do lançamento (já entra na versão nova);
//  - no meio de um simulado (só fora do player);
//  - depois de 31/01/2027.
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

const CAMPO = "novidades202611VistoEm";
const LANCAMENTO = Date.parse("2026-11-22T21:30:00Z"); // 22/11/2026 18:30 BRT
const FIM = Date.parse("2027-02-01T03:00:00Z");

const NOVIDADES = [
  "Prova completa com a língua que você escolher, sem misturar a reaplicação.",
  "Dá para pular questão, e o Finalizar avisa das que ficaram em branco.",
  "No resultado, cada questão abre direto e com as letras que você viu.",
  "O cronômetro pausa quando você sai do app, e dá para descartar um simulado.",
  "Uma sequência só para questões e flashcards, com dias de folga nas Configurações.",
];

function noPlayer(path: string) {
  // /aluno/simulados/{id} e subpáginas, menos /novo
  const m = path.match(/^\/aluno\/simulados\/([^/]+)/);
  return !!m && m[1] !== "novo";
}

export default function AvisoNovidades() {
  const pathname = usePathname() ?? "";
  // pendente = ainda não viu; fechado = já fechou nesta visita
  const [estado, setEstado] = useState<"esperando" | "pendente" | "fechado">("esperando");

  useEffect(() => {
    if (Date.now() >= FIM) return;
    return onAuthStateChanged(auth, async (u) => {
      if (!u) return;
      const criadaEm = Date.parse(u.metadata.creationTime ?? "");
      if (Number.isFinite(criadaEm) && criadaEm >= LANCAMENTO) return;
      try {
        const snap = await getDoc(doc(db, "users", u.uid, "meta", "avisos"));
        if (!snap.data()?.[CAMPO]) setEstado("pendente");
      } catch {
        /* sem leitura, não insiste: o aviso é opcional */
      }
    });
  }, []);

  if (estado !== "pendente" || noPlayer(pathname)) return null;
  return <Modal onFechar={() => setEstado("fechado")} />;
}

function Modal({ onFechar }: { onFechar: () => void }) {
  // Marca como visto assim que aparece (só escrita externa, sem estado).
  useEffect(() => {
    const u = auth.currentUser;
    if (!u) return;
    setDoc(doc(db, "users", u.uid, "meta", "avisos"), { [CAMPO]: serverTimestamp() }, { merge: true }).catch(() => {});
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="novidades-titulo">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onFechar} />
      <div className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl dark:bg-vinke-navy-card">
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar"
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-lg leading-none text-vinke-ink3 transition hover:bg-vinke-offwhite dark:hover:bg-vinke-navy-sel"
        >
          ×
        </button>
        <span className="inline-block rounded-full bg-vinke-soft px-2.5 py-0.5 text-[11px] font-bold tracking-[0.12em] text-vinke dark:bg-vinke/15 dark:text-vinke-lav">
          NOVIDADES
        </span>
        <h2 id="novidades-titulo" className="mt-2 font-display text-xl font-bold leading-tight text-vinke-ink dark:text-white">
          O Vinke ficou melhor
        </h2>
        <p className="mt-1 text-sm text-vinke-ink2 dark:text-slate-300">
          Corrigimos erros e fizemos melhorias que você pediu. Já está tudo no ar:
        </p>
        <ul className="mt-4 space-y-2.5">
          {NOVIDADES.map((t) => (
            <li key={t} className="flex gap-2.5 text-sm leading-5 text-vinke-ink dark:text-slate-200">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-vinke" aria-hidden="true" />
              {t}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={onFechar}
          className="mt-6 w-full rounded-xl bg-vinke px-4 py-3 text-sm font-bold text-white transition hover:opacity-90"
        >
          Entendi, vamos estudar
        </button>
      </div>
    </div>
  );
}
