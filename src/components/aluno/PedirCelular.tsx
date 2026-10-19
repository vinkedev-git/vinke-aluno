"use client";

// Aviso discreto para quem se cadastrou antes de existir o campo de celular
// (ou não quis informar na hora). Aparece no painel, é dispensável e a
// autorização de contato é separada — mesma regra do cadastro.

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, serverTimestamp, writeBatch } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { MessageCircle, X } from "lucide-react";

function formatarCelular(valor: string) {
  const d = valor.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export default function PedirCelular() {
  const [uid, setUid] = useState<string | null>(null);
  const [mostrar, setMostrar] = useState(false);
  const [celular, setCelular] = useState("");
  const [aceita, setAceita] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      setUid(user.uid);
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        const d = snap.data() as
          | { phone?: unknown; cellphone?: unknown; contatoDispensadoEm?: unknown }
          | undefined;
        const jaTem = Boolean(String(d?.phone ?? d?.cellphone ?? "").trim());
        const dispensou = Boolean(d?.contatoDispensadoEm);
        setMostrar(!jaTem && !dispensou);
      } catch {
        // pedir o telefone é acessório: qualquer falha simplesmente não mostra
      }
    });
    return () => unsub();
  }, []);

  const dispensar = async () => {
    setMostrar(false);
    if (!uid) return;
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, "users", uid), { contatoDispensadoEm: serverTimestamp() }, { merge: true });
      await batch.commit();
    } catch {
      /* se falhar, volta a aparecer no próximo acesso — sem problema */
    }
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uid) return;
    const digitos = celular.replace(/\D/g, "");
    if (digitos.length < 10 || digitos.length > 11) return;
    setSalvando(true);
    try {
      const batch = writeBatch(db);
      batch.set(
        doc(db, "users", uid),
        {
          phone: digitos,
          cellphone: digitos,
          aceitaContatoWhatsapp: aceita,
          ...(aceita ? { aceitaContatoEm: serverTimestamp() } : {}),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      batch.set(
        doc(db, "users", uid, "profile", "main"),
        { phone: digitos, cellphone: digitos, updatedAt: serverTimestamp() },
        { merge: true }
      );
      await batch.commit();
      setPronto(true);
      setTimeout(() => setMostrar(false), 2200);
    } finally {
      setSalvando(false);
    }
  };

  if (!mostrar) return null;

  return (
    <div className="relative flex flex-col gap-3 rounded-2xl border-[1.5px] border-vinke-ring bg-vinke-soft p-5 dark:border-vinke-navy-line dark:bg-vinke/10 sm:flex-row sm:items-center sm:justify-between">
      <button
        type="button"
        onClick={dispensar}
        aria-label="Dispensar"
        className="absolute right-3 top-3 text-vinke-ink3 transition hover:text-vinke-ink"
      >
        <X size={16} />
      </button>

      {pronto ? (
        <div className="flex items-center gap-3">
          <span className="text-vinke-green-text dark:text-vinke-green">✓</span>
          <span className="text-sm font-semibold text-vinke-ink dark:text-white">
            Celular salvo. Obrigado!
          </span>
        </div>
      ) : (
        <>
          <div className="flex items-start gap-3 pr-6">
            <span className="mt-0.5 text-vinke dark:text-vinke-lav">
              <MessageCircle size={18} />
            </span>
            <div>
              <div className="text-sm font-bold text-vinke-ink dark:text-white">
                Quer receber dicas de estudo no WhatsApp?
              </div>
              <div className="mt-0.5 text-xs font-medium text-vinke-ink2 dark:text-slate-300">
                Deixe seu celular (opcional). Serve também para a gente te avisar se algo
                acontecer com sua conta.
              </div>
            </div>
          </div>

          <form onSubmit={salvar} className="flex shrink-0 flex-col gap-2">
            <div className="flex gap-2">
              <input
                value={celular}
                onChange={(e) => setCelular(formatarCelular(e.target.value))}
                type="tel"
                inputMode="numeric"
                placeholder="(11) 99999-9999"
                className="h-10 w-full rounded-[9px] border-[1.5px] border-vinke-line bg-white px-3 text-sm font-medium text-vinke-ink outline-none transition placeholder:text-vinke-ink3 focus:border-vinke sm:w-44 dark:border-vinke-navy-line dark:bg-vinke-navy dark:text-slate-100"
              />
              <button
                type="submit"
                disabled={salvando || celular.replace(/\D/g, "").length < 10}
                className="shrink-0 rounded-[9px] bg-vinke px-4 text-xs font-bold text-white transition hover:bg-vinke-deep disabled:opacity-50"
              >
                {salvando ? "..." : "Salvar"}
              </button>
            </div>
            <label className="flex cursor-pointer items-start gap-2 text-[11px] leading-4 text-vinke-ink3">
              <input
                type="checkbox"
                checked={aceita}
                onChange={(e) => setAceita(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[#6236F0]"
              />
              <span>Aceito receber dicas e ofertas pelo WhatsApp</span>
            </label>
          </form>
        </>
      )}
    </div>
  );
}
