"use client";

import { onAuthStateChanged } from "firebase/auth";
import {
  doc,
  getDoc,
  getDocFromServer,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { auth, db } from "@/lib/firebase";

type TimestampLike = {
  seconds?: number;
  toDate?: () => Date;
};

type EntitlementDoc = {
  active?: boolean;
  validUntil?: unknown;
  dueDate?: unknown;
  contractDueDate?: unknown;
};

function isTimestampLike(value: unknown): value is TimestampLike {
  return typeof value === "object" && value !== null;
}

function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (v instanceof Timestamp) return v.toDate();
  if (typeof v === "string") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof v === "number") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  if (isTimestampLike(v) && typeof v.seconds === "number") return new Date(v.seconds * 1000);
  return null;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function getClientSessionId(uid: string) {
  if (typeof window === "undefined") return `server-${uid}`;

  const key = `aq.aluno.active-session.${uid}`;
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;

  const generated =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  window.localStorage.setItem(key, generated);
  return generated;
}

type ActiveSessionData = {
  sessionId?: unknown;
  lastSeenAt?: unknown;
};

export default function AlunoGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const redirectedRef = useRef(false);
  const heartbeatRef = useRef<number | null>(null);
  const sessionCheckRef = useRef<number | null>(null);
  const activeSessionUnsubRef = useRef<(() => void) | null>(null);
  const signingOutBySessionRef = useRef(false);

  const clearSessionSync = useCallback(() => {
    if (heartbeatRef.current != null) {
      window.clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    if (activeSessionUnsubRef.current) {
      activeSessionUnsubRef.current();
      activeSessionUnsubRef.current = null;
    }
    if (sessionCheckRef.current != null) {
      window.clearInterval(sessionCheckRef.current);
      sessionCheckRef.current = null;
    }
  }, []);

  const forceSessionLogout = useCallback(() => {
    if (signingOutBySessionRef.current) return;
    signingOutBySessionRef.current = true;
    clearSessionSync();
    void auth.signOut().finally(() => {
      router.replace("/aluno/entrar?erro=sessao_ativa");
    });
  }, [clearSessionSync, router]);

  const attachSessionMonitor = useCallback((userRef: ReturnType<typeof doc>, clientSessionId: string) => {
    const verifyOwnership = () => {
      void getDocFromServer(userRef)
        .then((snap) => {
          const data = snap.data() as { activeSession?: ActiveSessionData } | undefined;
          const remoteSessionId = String(data?.activeSession?.sessionId ?? "").trim();
          if (!remoteSessionId || remoteSessionId === clientSessionId) return;
          forceSessionLogout();
        })
        .catch(() => {
          // Falha de leitura nao deve derrubar sessao valida.
          // O logout acontece apenas quando outro sessionId e confirmado.
        });
    };

    activeSessionUnsubRef.current = onSnapshot(
      userRef,
      (snap) => {
        const data = snap.data() as { activeSession?: ActiveSessionData } | undefined;
        const remoteSessionId = String(data?.activeSession?.sessionId ?? "").trim();
        if (!remoteSessionId || remoteSessionId === clientSessionId) return;
        forceSessionLogout();
      },
      () => {
        // fallback para ambientes onde o listener real-time falhar
      }
    );

    // Fallback de segurança para garantir exclusão de sessão mesmo sem onSnapshot.
    sessionCheckRef.current = window.setInterval(() => {
      verifyOwnership();
    }, 3_000);

    const onWindowFocus = () => verifyOwnership();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") verifyOwnership();
    };

    window.addEventListener("focus", onWindowFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    const previousUnsub = activeSessionUnsubRef.current;
    activeSessionUnsubRef.current = () => {
      window.removeEventListener("focus", onWindowFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      previousUnsub?.();
    };

    verifyOwnership();
  }, [forceSessionLogout]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      clearSessionSync();
      if (user) {
        signingOutBySessionRef.current = false;
      }

      try {
        if (!user) {
          if (signingOutBySessionRef.current) {
            if (!redirectedRef.current) {
              redirectedRef.current = true;
              router.replace("/aluno/entrar?erro=sessao_ativa");
            }
            return;
          }

          if (!redirectedRef.current) {
            redirectedRef.current = true;
            router.replace("/aluno/entrar");
          }
          return;
        }

        // ✅ Rotas liberadas mesmo sem assinatura
        const allowWithoutEntitlement = ["/aluno/assinatura", "/aluno/perfil"];
        const isAllowedRoute = allowWithoutEntitlement.some((p) => pathname?.startsWith(p));

        const entRef = doc(db, "entitlements", user.uid);
        const entSnap = await getDoc(entRef);

        const ent = entSnap.exists() ? (entSnap.data() as EntitlementDoc) : null;

        const active = Boolean(ent?.active);
        const validUntil = toDate(ent?.validUntil || ent?.dueDate || ent?.contractDueDate);
        const expired = validUntil ? validUntil < startOfToday() : false;

        // ✅ Se não tem entitlement / inativo / expirado, manda para assinatura
        if (!isAllowedRoute && (!ent || !active || expired)) {
          const reason = !ent ? "no_entitlement" : !active ? "inactive" : "expired";
          router.replace(`/aluno/assinatura?reason=${reason}`);
          return;
        }

        const userRef = doc(db, "users", user.uid);
        const clientSessionId = getClientSessionId(user.uid);
        let lockConfirmed = false;
        let lockSoftBypass = false;

        try {
          await runTransaction(db, async (tx) => {
            tx.set(
              userRef,
              {
                activeSession: {
                  sessionId: clientSessionId,
                  device: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 180) : "unknown",
                  claimedAt: serverTimestamp(),
                  lastSeenAt: serverTimestamp(),
                },
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            );
          });
          lockConfirmed = true;
        } catch (error) {
          const code = (error as { code?: string })?.code ?? "";
          if (code.includes("permission-denied") || code.includes("unavailable")) {
            lockSoftBypass = true;
          }
          console.error("Falha ao sincronizar lock de sessao:", error);
        }

        if (!lockConfirmed) {
          try {
            const lockSnap = await getDocFromServer(userRef);
            const lockData = lockSnap.data() as { activeSession?: ActiveSessionData } | undefined;
            const remoteSessionId = String(lockData?.activeSession?.sessionId ?? "").trim();
            const remoteLastSeenMs = toDate(lockData?.activeSession?.lastSeenAt)?.getTime() ?? 0;
            const lockAlive = remoteLastSeenMs > 0 && Date.now() - remoteLastSeenMs < 20_000;

            if (remoteSessionId && remoteSessionId !== clientSessionId && lockAlive) {
              await auth.signOut();
              router.replace("/aluno/entrar?erro=sessao_ativa");
              return;
            }

            if (remoteSessionId === clientSessionId) {
              lockConfirmed = true;
            }
          } catch (error) {
            const code = (error as { code?: string })?.code ?? "";
            if (code.includes("permission-denied") || code.includes("unavailable")) {
              lockSoftBypass = true;
            }
            console.error("Falha ao confirmar lock de sessao no servidor:", error);
          }
        }

        // Se nao for possivel confirmar lock no servidor, nao bloqueia login.
        // Mantemos monitor/heartbeat para derrubar sessoes antigas quando o lock estiver disponivel.
        if (!lockConfirmed && !lockSoftBypass) {
          console.warn("Sessao sem lock confirmado: seguindo em modo degradado.");
        }

        attachSessionMonitor(userRef, clientSessionId);

        heartbeatRef.current = window.setInterval(() => {
          void runTransaction(db, async (tx) => {
            const snap = await tx.get(userRef);
            const data = snap.data() as { activeSession?: ActiveSessionData } | undefined;
            const currentSessionId = String(data?.activeSession?.sessionId ?? "").trim();

            // Se perdeu o lock para outro dispositivo, nao tenta sobrescrever.
            if (currentSessionId && currentSessionId !== clientSessionId) {
              return false;
            }

            tx.set(
              userRef,
              {
                activeSession: {
                  sessionId: clientSessionId,
                  lastSeenAt: serverTimestamp(),
                },
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            );
            return true;
          })
          .then((ok) => {
            if (ok === false) forceSessionLogout();
          })
          .catch(() => {
            // heartbeat best-effort
          });
        }, 8_000);
      } finally {
        setLoading(false);
      }
    });

    return () => {
      clearSessionSync();
      unsub();
    };
  }, [router, pathname, clearSessionSync, attachSessionMonitor, forceSessionLogout]);

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="rounded-3xl border bg-white shadow-sm px-6 py-5 text-slate-700">
          Carregando…
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
