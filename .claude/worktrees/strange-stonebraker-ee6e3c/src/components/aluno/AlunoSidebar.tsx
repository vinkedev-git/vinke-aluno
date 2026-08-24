"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAlunoTheme } from "@/components/aluno/AlunoThemeProvider";
import {
  Home,
  Brain,
  Layers,
  NotebookPen,
  Sparkles,
  Settings2,
  CreditCard,
  User,
  LogOut,
  Sun,
  Moon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

function cn(...xs: Array<string | false | undefined | null>) {
  return xs.filter(Boolean).join(" ");
}

function isActivePath(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (href === "/aluno") return pathname === "/aluno" || pathname === "/aluno/";
  return pathname === href || pathname.startsWith(href + "/");
}

function Item({
  href,
  label,
  Icon,
  onNavigate,
  disabled,
  badge,
}: {
  href: string;
  label: string;
  Icon: LucideIcon;
  onNavigate?: () => void;
  disabled?: boolean;
  badge?: string;
}) {
  const pathname = usePathname();
  const active = isActivePath(pathname, href);

  if (disabled) {
    return (
      <div className="flex cursor-not-allowed items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold opacity-40">
        <Icon size={18} className="shrink-0 opacity-60" />
        <span className="truncate">{label}</span>
        <span className="ml-auto shrink-0 rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500">
          Em breve
        </span>
      </div>
    );
  }

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "group flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition",
        active
          ? "bg-slate-900 text-white shadow-[0_10px_30px_rgba(15,23,42,0.25)] dark:bg-gradient-to-r dark:from-blue-500 dark:to-indigo-500 dark:text-white dark:shadow-[0_20px_45px_rgba(37,99,235,0.35)]"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/70 dark:hover:text-slate-100"
      )}
    >
      <Icon
        size={18}
        className={cn(
          "shrink-0 transition-opacity",
          active ? "opacity-100" : "opacity-60 group-hover:opacity-100"
        )}
      />
      <span className="truncate">{label}</span>
      {badge && (
        <span
          className={cn(
            "ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
            active
              ? "bg-white/20 text-white"
              : "bg-gradient-to-r from-blue-500 to-indigo-500 text-white"
          )}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}

export default function AlunoSidebar({
  variant = "desktop",
  onNavigate,
}: {
  variant?: "desktop" | "drawer";
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const { theme, setTheme } = useAlunoTheme();
  const [logoError, setLogoError] = useState(false);

  const logout = async () => {
    await signOut(auth);
    onNavigate?.();
    router.replace("/aluno/entrar");
  };

  const isDrawer = variant === "drawer";

  return (
    <aside
      className={cn(
        "shrink-0 bg-white text-slate-900 flex flex-col dark:bg-[#030b21] dark:text-slate-100",
        isDrawer
          ? "h-full w-full"
          : "hidden lg:flex w-[260px] min-h-screen sticky top-0 border-r border-slate-200 dark:border-slate-800/80"
      )}
    >
      {/* Brand */}
      <div className="px-5 py-5 border-b border-slate-200 dark:border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl overflow-hidden bg-slate-900 text-white flex items-center justify-center font-black dark:border dark:border-slate-700/80 dark:bg-[#061738] dark:text-blue-300">
            {!logoError ? (
              <Image
                src="/logo.png"
                alt="Logo Anestesia Questões"
                width={44}
                height={44}
                className="h-[80%] w-[80%] object-contain"
                onError={() => setLogoError(true)}
              />
            ) : (
              "AQ"
            )}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-black text-slate-900 truncate dark:text-slate-100">
              Anestesia Questões
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Área do Aluno</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="px-4 py-4 flex flex-col gap-1">
        <div className="px-2 mb-1 text-[10px] font-bold tracking-[0.22em] text-slate-400 dark:text-slate-600 uppercase">
          Navegação
        </div>
        <Item href="/aluno" label="Início" Icon={Home} onNavigate={onNavigate} />
        <Item href="/aluno/estudo-de-hoje" label="Estudo de hoje" Icon={Sparkles} onNavigate={onNavigate} />
        <Item href="/aluno/simulados" label="Simulados" Icon={Brain} onNavigate={onNavigate} />
        <Item href="/aluno/flashcards" label="Flashcards" Icon={Layers} onNavigate={onNavigate} badge="Novo" />
        <Item href="/aluno/caderno" label="Caderno de Erros" Icon={NotebookPen} onNavigate={onNavigate} badge="Novo" />
        <Item href="/aluno/assinatura" label="Assinatura" Icon={CreditCard} onNavigate={onNavigate} />
        <Item href="/aluno/perfil" label="Perfil" Icon={User} onNavigate={onNavigate} />
        <Item href="/aluno/configuracoes" label="Metas diárias" Icon={Settings2} onNavigate={onNavigate} />
      </nav>

      <div className="mt-auto space-y-3 border-t border-slate-200 bg-white px-4 py-4 dark:border-slate-800/80 dark:bg-[#030b21]">
        {/* Theme toggle */}
        <div className="rounded-2xl border border-slate-200 p-2 dark:border-slate-800/80 dark:bg-[#04102a]">
          <div className="mb-2 px-2 text-[10px] font-bold tracking-[0.22em] text-slate-400 dark:text-slate-600 uppercase">
            Tema
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTheme("light")}
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition",
                theme === "light"
                  ? "border-slate-300 bg-white text-slate-900 shadow-sm"
                  : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
              )}
            >
              <Sun size={14} />
              Claro
            </button>
            <button
              type="button"
              onClick={() => setTheme("dark")}
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition",
                theme === "dark"
                  ? "border-blue-400/40 bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-[0_10px_30px_rgba(37,99,235,0.35)]"
                  : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
              )}
            >
              <Moon size={14} />
              Escuro
            </button>
          </div>
        </div>

        {/* Logout — ghost/outline, menos destaque */}
        <button
          onClick={logout}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700/80 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:bg-slate-800/50 dark:hover:text-slate-200"
        >
          <LogOut size={15} />
          Sair
        </button>
      </div>
    </aside>
  );
}
