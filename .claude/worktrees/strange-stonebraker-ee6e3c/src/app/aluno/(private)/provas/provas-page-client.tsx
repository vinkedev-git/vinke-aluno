"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, getDocs, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

type Prova = {
  id: string;
  nome?: string;
  sigla?: string;
  ordem?: number;
  ativo?: boolean;

  // fallback se você tiver outro campo no futuro
  title?: string;
};

function getErrorCode(error: unknown) {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : "";
  }
  return "";
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function cn(...xs: Array<string | false | undefined | null>) {
  return xs.filter(Boolean).join(" ");
}

export default function ProvasPageClient() {
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [provas, setProvas] = useState<Prova[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setErro(null);

      try {
        // IMPORTANTE: no seu Firestore o campo é "ativo" (PT-BR), não "active".
        const q = query(
          collection(db, "provas"),
          where("ativo", "==", true),
          orderBy("ordem", "asc")
        );

        const snap = await getDocs(q);

        const rows: Prova[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Prova, "id">),
        }));

        if (!alive) return;
        setProvas(rows);
      } catch (error: unknown) {
        // Se rules bloquearem, normalmente vem "permission-denied"
        const code = getErrorCode(error);
        const msg =
          code === "permission-denied"
            ? "Permissão negada ao ler 'provas'. Verifique as Rules do Firestore."
            : code === "failed-precondition"
            ? "Faltou índice no Firestore para essa query (ativo + ordem). O console do Firebase mostra o link para criar."
            : getErrorMessage(error, "Erro ao carregar provas.");

        if (!alive) return;
        setErro(msg);
        setProvas([]);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return provas;

    return provas.filter((p) => {
      const nome = (p.nome || p.title || "").toLowerCase();
      const sigla = (p.sigla || "").toLowerCase();
      return nome.includes(s) || sigla.includes(s);
    });
  }, [provas, search]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-3xl border bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="px-6 py-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100">Provas</div>
            <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Escolha uma prova para começar a resolver questões
            </div>
          </div>

          <div className="flex w-full items-center gap-3 sm:w-auto">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar (ex: TSA 2024, banca, título...)"
              className="ui-input w-full sm:w-[280px]"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="rounded-3xl border bg-white shadow-sm overflow-hidden dark:border-slate-800 dark:bg-slate-900">
        <div className="p-6">
          {loading ? (
            <div className="text-sm text-slate-500 dark:text-slate-400">Carregando provas…</div>
          ) : erro ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-300">
              {erro}
            </div>
          ) : filtered.length === 0 ? (
            <div className="space-y-2">
              <div className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Nenhuma prova encontrada
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                Tente ajustar a busca, ou confirme se a coleção <b>provas</b>{" "}
                existe e se o campo <b>ativo</b> está como <b>true</b>.
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map((p) => {
                const title = p.nome || p.title || "Prova";
                const badge = p.sigla ? p.sigla : "PROVA";
                return (
                  <Link
                    key={p.id}
                    href={`/aluno/simulados/novo?provaId=${encodeURIComponent(p.id)}`}
                    className={cn(
                      "group rounded-3xl border p-5 transition bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800",
                      "hover:shadow-[0_20px_60px_rgba(15,23,42,0.10)]"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                          {badge}
                        </div>
                        <div className="mt-1 text-lg font-black text-slate-900 truncate dark:text-slate-100">
                          {title}
                        </div>
                        <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                          Clique para ver as questões
                        </div>
                      </div>

                      <div className="h-10 w-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-black dark:bg-slate-100 dark:text-slate-900">
                        →
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
