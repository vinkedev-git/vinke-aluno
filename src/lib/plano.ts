"use client";

// Modelo de planos do Vinke.
//
// A fonte da verdade é o doc entitlements/{uid}:
//   - plan: "gratuito" | "mensal" | "anual" | "reta-final"
//   - active / validUntil continuam controlando o ACESSO (AlunoGuard);
//     este módulo controla o que cada plano PODE fazer dentro do app.
//
// Entitlements antigos sem o campo `plan` são tratados como pagos —
// foram criados manualmente pelo admin antes do plano gratuito existir.

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export const LIMITES_GRATIS = {
  questoesPorDia: 10,
  simuladosPorMes: 1,
} as const;

export type PlanoInfo = {
  carregando: boolean;
  /** true quando o aluno está no plano gratuito (recursos pagos bloqueados) */
  gratuito: boolean;
  plan: string;
};

export function isPlanoGratuito(entitlement: { plan?: unknown } | null | undefined): boolean {
  return String(entitlement?.plan ?? "") === "gratuito";
}

// Mesmo formato do dayKey() de study-tracking.ts (data local YYYY-MM-DD)
function dayKeyHoje(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * Questões respondidas hoje, a partir de users/{uid}/meta/stats
 * (todayAnswered/todayKey, mantidos por recordAnswer). Retorna null
 * enquanto carrega.
 */
export function useQuestoesHoje(): number | null {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let unsubStats: (() => void) | null = null;
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      unsubStats?.();
      unsubStats = null;
      if (!user) {
        setCount(null);
        return;
      }
      unsubStats = onSnapshot(
        doc(db, "users", user.uid, "meta", "stats"),
        (snap) => {
          const data = snap.exists()
            ? (snap.data() as { todayAnswered?: unknown; todayKey?: unknown })
            : null;
          const sameDay = String(data?.todayKey ?? "") === dayKeyHoje();
          setCount(sameDay ? Number(data?.todayAnswered ?? 0) || 0 : 0);
        },
        () => setCount(0)
      );
    });
    return () => {
      unsubStats?.();
      unsubAuth();
    };
  }, []);

  return count;
}

/**
 * Plano gratuito: 1 simulado por mês. Conta as sessões criadas no mês
 * corrente, ignorando as de revisão de erros (kind "error_review", que só
 * existem em recursos pagos).
 */
export async function simuladoDoMesJaUsado(uid: string): Promise<boolean> {
  const inicioDoMes = new Date();
  inicioDoMes.setDate(1);
  inicioDoMes.setHours(0, 0, 0, 0);
  const snap = await getDocs(
    query(
      collection(db, "users", uid, "sessions"),
      where("createdAt", ">=", Timestamp.fromDate(inicioDoMes))
    )
  );
  return snap.docs.some((d) => (d.data() as { kind?: unknown }).kind !== "error_review");
}

export function usePlano(): PlanoInfo {
  const [info, setInfo] = useState<PlanoInfo>({ carregando: true, gratuito: false, plan: "" });

  useEffect(() => {
    let unsubEnt: (() => void) | null = null;
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      unsubEnt?.();
      unsubEnt = null;
      if (!user) {
        setInfo({ carregando: false, gratuito: false, plan: "" });
        return;
      }
      unsubEnt = onSnapshot(
        doc(db, "entitlements", user.uid),
        (snap) => {
          const data = snap.exists() ? (snap.data() as { plan?: unknown }) : null;
          setInfo({
            carregando: false,
            gratuito: isPlanoGratuito(data),
            plan: String(data?.plan ?? ""),
          });
        },
        () => {
          // Falha de leitura não bloqueia: assume pago para não travar quem pagou.
          setInfo({ carregando: false, gratuito: false, plan: "" });
        }
      );
    });
    return () => {
      unsubEnt?.();
      unsubAuth();
    };
  }, []);

  return info;
}
