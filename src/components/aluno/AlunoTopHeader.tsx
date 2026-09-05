"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
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

  // onSnapshot para o nome refletir na hora quando o aluno salva o perfil
  // (o layout não remonta ao navegar, então uma leitura única ficava velha).
  useEffect(() => {
    if (!user?.uid) {
      setProfileName("");
      return;
    }

    const unsub = onSnapshot(
      doc(db, "users", user.uid),
      (snap) => {
        const data = snap.exists() ? (snap.data() as { name?: unknown; nome?: unknown }) : null;
        const rawName = data?.name ?? data?.nome ?? "";
        setProfileName(String(rawName).trim());
      },
      () => setProfileName("")
    );
    return () => unsub();
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
    if (!base) return "V";
    const parts = base.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0].slice(0, 1) + parts[1].slice(0, 1)).toUpperCase();
  }, [displayName]);

  return (
    <header className="sticky top-0 z-30 overflow-hidden border-b border-vinke-line bg-white/85 backdrop-blur dark:border-vinke-navy-line dark:bg-vinke-navy-deep/95">
      <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-10">
        {/* Left */}
        <div className="flex items-center gap-3 min-w-0">
          {/* Botão menu (mobile/tablet) */}
          <button
            type="button"
            onClick={onMenuClick}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-vinke-line bg-white text-vinke-ink2 shadow-sm lg:hidden dark:border-vinke-navy-line dark:bg-vinke-navy-card dark:text-slate-300"
            aria-label="Abrir menu"
          >
            <Menu size={18} />
          </button>

          <div className="min-w-0">
            <div className="text-xs font-semibold text-vinke-ink3">
              {headerSubtitle}
            </div>
            <div className="truncate font-display text-lg font-bold text-vinke-ink dark:text-slate-100">
              {headerTitle}
            </div>
          </div>
        </div>

        {/* Right */}
        <div className="flex min-w-0 shrink-0 items-center gap-3">
          <div className="hidden max-w-[220px] truncate text-sm text-vinke-ink2 sm:block dark:text-slate-300">
            {displayName}
          </div>

          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-vinke font-display text-sm font-bold text-white sm:h-10 sm:w-10">
            {initials}
          </div>
        </div>
      </div>
    </header>
  );
}
