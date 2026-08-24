"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { planHasFlashcardsAccess } from "./constants";
import { featureFlags } from "@/lib/featureFlags";

/**
 * Hook para checar se o aluno logado tem acesso a flashcards.
 * Regra: precisa ter assinatura ativa E plano TSA.
 */
export function useHasFlashcardsAccess() {
  const [state, setState] = useState<{
    loading: boolean;
    hasAccess: boolean;
    reason: "no_user" | "no_entitlement" | "wrong_plan" | "flag_off" | "ok" | null;
  }>({ loading: true, hasAccess: false, reason: null });

  useEffect(() => {
    // Feature flag global — se desligada, ninguem tem acesso
    if (!featureFlags.flashcards) {
      setState({ loading: false, hasAccess: false, reason: "flag_off" });
      return;
    }

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setState({ loading: false, hasAccess: false, reason: "no_user" });
        return;
      }
      try {
        const ref = doc(db, "entitlements", user.uid);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          setState({ loading: false, hasAccess: false, reason: "no_entitlement" });
          return;
        }
        const data = snap.data() as Record<string, unknown>;
        const active = Boolean(data.active);
        if (!active) {
          setState({ loading: false, hasAccess: false, reason: "no_entitlement" });
          return;
        }
        const isTsa = planHasFlashcardsAccess({
          code: typeof data.planId === "string" ? data.planId : null,
          title: typeof data.productTitle === "string" ? data.productTitle : null,
          productId: typeof data.productId === "string" ? data.productId : null,
        });
        if (!isTsa) {
          setState({ loading: false, hasAccess: false, reason: "wrong_plan" });
          return;
        }
        setState({ loading: false, hasAccess: true, reason: "ok" });
      } catch {
        setState({ loading: false, hasAccess: false, reason: "no_entitlement" });
      }
    });
    return unsub;
  }, []);

  return state;
}
