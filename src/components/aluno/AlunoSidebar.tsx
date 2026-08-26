"use client";

import Link from "next/link";
import { VinkeSymbol } from "@/components/VinkeLogo";
import { usePathname, useRouter } from "next/navigation";
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
          ? "bg-vinke font-bold text-white shadow-[0_10px_30px_rgba(98,54,240,0.25)]"
          : "text-vinke-ink2 hover:bg-vinke-soft hover:text-vinke-ink dark:text-slate-400 dark:hover:bg-vinke-navy-sel dark:hover:text-slate-100"
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
              : "bg-vinke text-white"
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

  const logout = async () => {
    await signOut(auth);
    onNavigate?.();
    router.replace("/aluno/entrar");
  };

  const isDrawer = variant === "drawer";

  return (
    <aside
      className={cn(
        "shrink-0 bg-white text-vinke-ink flex flex-col dark:bg-vinke-navy-deep dark:text-slate-100",
        isDrawer
          ? "h-full w-full"
          : "hidden lg:flex w-[260px] min-h-screen sticky top-0 border-r border-vinke-line dark:border-vinke-navy-line"
      )}
    >
      {/* Brand */}
      <div className="px-5 py-5 border-b border-vinke-line2 dark:border-vinke-navy-line">
        <div className="flex items-center gap-2">
          <VinkeSymbol size={22} className="text-vinke dark:text-white" />
          <span className="font-display text-lg font-bold tracking-[0.01em] text-vinke-ink dark:text-white">
            VINKE
          </span>
          <span className="mt-[3px] text-[9px] font-semibold tracking-[0.16em] text-vinke-ink3">
            ALUNO
          </span>
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

      <div className="mt-auto space-y-3 border-t border-vinke-line2 bg-white px-4 py-4 dark:border-vinke-navy-line dark:bg-vinke-navy-deep">
        {/* Theme toggle */}
        <div className="rounded-2xl border border-vinke-line p-2 dark:border-vinke-navy-line dark:bg-vinke-navy">
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
                  ? "border-vinke/40 bg-vinke text-white shadow-[0_10px_30px_rgba(98,54,240,0.35)]"
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
