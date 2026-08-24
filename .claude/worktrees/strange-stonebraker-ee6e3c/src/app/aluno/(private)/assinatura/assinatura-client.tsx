"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { doc, getDoc, Timestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";

type Entitlement = {
  uid?: string;
  email?: string;

  active?: boolean;
  pending?: boolean;

  // do webhook
  productTitle?: string | null;
  productId?: string | null;

  // datas
  validUntil?: unknown;
  updatedAt?: unknown;

  // extras (se tiver)
  amountPaid?: number | null;
  currency?: string | null;

  source?: string | null;
};

type TimestampLike = {
  seconds?: number;
  toDate?: () => Date;
};

function isTimestampLike(value: unknown): value is TimestampLike {
  return typeof value === "object" && value !== null;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function toDate(value: unknown): Date | null {
  if (!value) return null;

  // Firestore Timestamp
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (isTimestampLike(value) && typeof value.toDate === "function") return value.toDate();

  // ISO string / date-like
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }

  // fallback { seconds }
  if (isTimestampLike(value) && typeof value.seconds === "number") return new Date(value.seconds * 1000);

  return null;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysUntil(date: Date) {
  const ms = date.getTime() - startOfToday().getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function formatDateBR(value: unknown): string {
  const d = toDate(value);
  if (!d) return "—";
  return d.toLocaleDateString("pt-BR");
}

function formatMoneyBRL(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function statusLabel(params: { ent: Entitlement | null; expired: boolean }) {
  const { ent, expired } = params;

  if (!ent) return { text: "Não encontrada", cls: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700" };
  if (expired) return { text: "Expirada", cls: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-900/40" };
  if (ent.active) return { text: "Ativa", cls: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/40" };
  if (ent.pending) return { text: "Pendente", cls: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/40" };
  return { text: "Inativa", cls: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-900/40" };
}

function reasonBannerText(reason: string | null) {
  if (!reason) return "";
  if (reason === "expired") return "Seu acesso expirou. Renove para continuar usando.";
  if (reason === "inactive") return "Seu acesso está inativo no momento.";
  if (reason === "no_entitlement") return "Nenhuma assinatura ativa foi encontrada para seu usuário.";
  return "";
}

export default function AssinaturaClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");

  const user = auth.currentUser;

  const [loading, setLoading] = useState(true);
  const [ent, setEnt] = useState<Entitlement | null>(null);
  const [error, setError] = useState("");

  async function load() {
    const u = auth.currentUser;
    if (!u) {
      setLoading(false);
      setError("Você precisa estar logado.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const ref = doc(db, "entitlements", u.uid);
      const snap = await getDoc(ref);

      if (!snap.exists()) {
        setEnt(null);
        setError("Nenhuma assinatura encontrada para este usuário.");
        return;
      }

      const data = snap.data() as Omit<Entitlement, "uid">;
      setEnt({ ...data, uid: u.uid, email: u.email || data.email });
    } catch (error: unknown) {
      console.error(error);
      setError(getErrorMessage(error, "Falha ao carregar assinatura."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const validUntilDate = useMemo(() => toDate(ent?.validUntil), [ent?.validUntil]);
  const remainingDays = useMemo(
    () => (validUntilDate ? daysUntil(validUntilDate) : null),
    [validUntilDate]
  );
  const expired = useMemo(() => (remainingDays !== null ? remainingDays < 0 : false), [remainingDays]);

  const badge = useMemo(() => statusLabel({ ent, expired }), [ent, expired]);

  const planName = ent?.productTitle?.trim() || "Plano";
  const vencimento = formatDateBR(ent?.validUntil);

  const warning = useMemo(() => {
    if (!validUntilDate) return null;
    if (remainingDays === null) return null;

    if (remainingDays < 0) return { tone: "danger", text: "Sua assinatura expirou. Renove para continuar usando." };
    if (remainingDays === 0) return { tone: "warning", text: "Sua assinatura vence hoje." };
    if (remainingDays <= 7) return { tone: "warning", text: `Sua assinatura vence em ${remainingDays} dias.` };

    return null;
  }, [validUntilDate, remainingDays]);

  const topReasonBanner = reasonBannerText(reason);

  const paidText = useMemo(() => {
    const value = ent?.amountPaid;
    if (typeof value === "number" && Number.isFinite(value)) return formatMoneyBRL(value);
    return "—";
  }, [ent?.amountPaid]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-3xl border bg-white shadow-sm p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="text-xs text-slate-500 dark:text-slate-400">Área do Aluno</div>
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100">Assinatura</div>
            <div className="text-sm text-slate-600 mt-1 dark:text-slate-300">
              Confira o status do seu plano e a data de vencimento.
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="secondary" onClick={() => router.push("/aluno")} className="w-full sm:w-auto">
              Voltar
            </Button>
            <Button onClick={load} className="w-full sm:w-auto">
              Atualizar
            </Button>
          </div>
        </div>
      </div>

      {/* Banner por reason (quando o Guard redirecionar) */}
      {topReasonBanner ? (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 shadow-sm p-6 dark:border-amber-900/40 dark:bg-amber-950/30">
          <div className="text-lg font-black text-slate-900 dark:text-slate-100">Atenção</div>
          <div className="mt-1 text-sm text-slate-700 dark:text-slate-200">{topReasonBanner}</div>
        </div>
      ) : null}

      {/* Content */}
      {loading ? (
        <div className="rounded-3xl border bg-white shadow-sm p-6 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">Carregando…</div>
      ) : error ? (
        <div className="rounded-3xl border bg-white shadow-sm p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-lg font-black text-slate-900 dark:text-slate-100">Assinatura</div>
          <div className="mt-2 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>

          <div className="mt-4 text-sm text-slate-600 dark:text-slate-300">
            Se você acabou de comprar, aguarde alguns instantes para o webhook atualizar seu acesso.
          </div>

          <div className="mt-5 flex flex-col sm:flex-row gap-3">
            <Button variant="secondary" onClick={() => router.push("/aluno/perfil")} className="w-full sm:w-auto">
              Ir para Perfil
            </Button>
            <Button onClick={load} className="w-full sm:w-auto">
              Tentar novamente
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coluna principal */}
          <div className="lg:col-span-2 space-y-6">
            {/* Warning de vencimento */}
            {warning ? (
              <div
                className={[
                  "rounded-3xl border shadow-sm p-6",
                  warning.tone === "danger"
                    ? "border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/30"
                    : "border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30",
                ].join(" ")}
              >
                <div className="text-lg font-black text-slate-900 dark:text-slate-100">Atenção</div>
                <div className="mt-1 text-sm text-slate-700 dark:text-slate-200">{warning.text}</div>
              </div>
            ) : null}

            {/* Card principal */}
            <div className="rounded-3xl border bg-white shadow-sm p-6 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="text-sm text-slate-500 dark:text-slate-400">Seu plano</div>
                  <div className="mt-1 text-xl font-black text-slate-900 truncate dark:text-slate-100">{planName}</div>
                  <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                    E-mail:{" "}
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {ent?.email || user?.email || "—"}
                    </span>
                  </div>
                </div>

                <span
                  className={[
                    "shrink-0 rounded-full border px-3 py-1 text-xs font-bold",
                    badge.cls,
                  ].join(" ")}
                >
                  {badge.text}
                </span>
              </div>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-2xl border bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-800">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Vencimento</div>
                  <div className="mt-2 text-2xl font-black text-slate-900 dark:text-slate-100">{vencimento}</div>
                  <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    {remainingDays === null ? "—" : expired ? "Expirada" : `${remainingDays} dia(s) restantes`}
                  </div>
                </div>

                <div className="rounded-2xl border bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-800">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Valor</div>
                  <div className="mt-2 text-2xl font-black text-slate-900 dark:text-slate-100">{paidText}</div>
                  <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">{ent?.currency || "BRL"}</div>
                </div>

                <div className="rounded-2xl border bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-800">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Produto</div>
                  <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {ent?.productId ? `ID: ${ent.productId}` : "—"}
                  </div>
                  <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    Origem: <span className="font-semibold text-slate-700 dark:text-slate-200">{ent?.source || "—"}</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-5 border-t border-slate-200 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between dark:border-slate-800">
                <div className="text-sm text-slate-600 dark:text-slate-300">
                  Precisa de ajuda com sua assinatura? Fale com o suporte.
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button variant="secondary" onClick={() => router.push("/aluno/perfil")} className="w-full sm:w-auto">
                    Ver Perfil
                  </Button>
                  <Button onClick={() => router.push("/aluno")} className="w-full sm:w-auto">
                    Ir ao Início
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Lateral */}
          <div className="rounded-3xl border bg-white shadow-sm p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="text-lg font-black text-slate-900 dark:text-slate-100">Dicas</div>

            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                <div className="text-sm font-bold text-slate-900 dark:text-slate-100">Atualização automática</div>
                <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  Seu acesso é atualizado via webhook da Eduzz (pagamento/renovação/cancelamento).
                </div>
              </div>

              <div className="rounded-2xl border bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                <div className="text-sm font-bold text-slate-900 dark:text-slate-100">Mudou de e-mail?</div>
                <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  Se comprou com outro e-mail, o sistema cria o acesso por aquele e-mail.
                </div>
              </div>

              <div className="rounded-2xl border bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                <div className="text-sm font-bold text-slate-900 dark:text-slate-100">Renovação</div>
                <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  Se sua assinatura estiver expirada, faça a renovação na Eduzz e clique em <b>Atualizar</b>.
                </div>
              </div>
            </div>

            <Button onClick={() => router.push("/aluno")} className="mt-6 w-full">
              Voltar ao Início
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
