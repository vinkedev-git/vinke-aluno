"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { Menu } from "lucide-react";
import { usePageHeader } from "@/components/aluno/AlunoPageHeaderContext";

function getBreadcrumb(pathname: string | null) {
  if (!pathname) return "Início";

  if (pathname.startsWith("/aluno/resolver")) return "Simulado";
  if (pathname.startsWith("/aluno/simulados")) return "Simulados";
  if (pathname.startsWith("/aluno/provas")) return "Provas";
  if (pathname.startsWith("/aluno/ranking")) return "Ranking";
  if (pathname.startsWith("/aluno/assinatura")) return "Assinatura";
  if (pathname.startsWith("/aluno/perfil")) return "Perfil";

  return "Início";
}

export default function AlunoTopHeader({
  onMenuClick,
}: {
  onMenuClick?: () => void;
}) {
  const pathname = usePathname();

  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [profileName, setProfileName] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  useEffect(() => {
    let active = true;

    async function loadProfileName() {
      if (!user?.uid) {
        if (active) setProfileName("");
        return;
      }

      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        const rawName = snap.exists() ? snap.data()?.name : "";
        if (active) setProfileName(String(rawName ?? "").trim());
      } catch {
        if (active) setProfileName("");
      }
    }

    void loadProfileName();
    return () => {
      active = false;
    };
  }, [user?.uid]);

  const breadcrumb = useMemo(() => getBreadcrumb(pathname), [pathname]);
  const { title: pageTitle, subtitle: pageSubtitle } = usePageHeader();

  const headerTitle = pageTitle || breadcrumb;
  const headerSubtitle = pageSubtitle || "Área do Aluno";

  const displayName = useMemo(() => {
    const fromProfile = profileName.trim();
    if (fromProfile) return fromProfile;
    const fromAuth = String(user?.displayName ?? "").trim();
    if (fromAuth) return fromAuth;
    return String(user?.email ?? "").trim();
  }, [profileName, user?.displayName, user?.email]);

  const initials = useMemo(() => {
    const base = displayName.trim();
    if (!base) return "AQ";
    const parts = base.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0].slice(0, 1) + parts[1].slice(0, 1)).toUpperCase();
  }, [displayName]);

  return (
    <header className="sticky top-0 z-30 overflow-hidden border-b border-slate-200/70 bg-white/85 backdrop-blur dark:border-slate-800/80 dark:bg-[#050f2c]/95">
      <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-10">
        {/* Left */}
        <div className="flex items-center gap-3 min-w-0">
          {/* Botão menu (mobile/tablet) */}
          <button
            type="button"
            onClick={onMenuClick}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm lg:hidden dark:border-slate-700 dark:bg-[#061738] dark:text-slate-300"
            aria-label="Abrir menu"
          >
            <Menu size={18} />
          </button>

          <div className="min-w-0">
            <div className="text-xs text-slate-500 font-semibold dark:text-slate-400">
              {headerSubtitle}
            </div>
            <div className="text-lg font-black text-slate-900 truncate dark:text-slate-100">
              {headerTitle}
            </div>
          </div>
        </div>

        {/* Right */}
        <div className="flex min-w-0 shrink-0 items-center gap-3">
          <div className="hidden sm:block text-sm text-slate-600 truncate max-w-[220px] dark:text-slate-300">
            {displayName}
          </div>

          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-sm font-bold text-white shadow-lg sm:h-10 sm:w-10 dark:border dark:border-slate-700 dark:bg-slate-100 dark:text-slate-900">
            {initials}
          </div>
        </div>
      </div>
    </header>
  );
}
