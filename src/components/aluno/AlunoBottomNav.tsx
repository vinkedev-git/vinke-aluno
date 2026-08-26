"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Sparkles, Brain, Layers, Menu } from "lucide-react";
import type { LucideIcon } from "lucide-react";

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function isActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (href === "/aluno") return pathname === "/aluno" || pathname === "/aluno/";
  return pathname === href || pathname.startsWith(href + "/");
}

function NavItem({
  href,
  label,
  Icon,
}: {
  href: string;
  label: string;
  Icon: LucideIcon;
}) {
  const pathname = usePathname();
  const active = isActive(pathname, href);
  return (
    <Link
      href={href}
      className={cn(
        "flex flex-1 flex-col items-center gap-0.5 py-1",
        active ? "text-vinke dark:text-vinke-lav" : "text-vinke-ink3"
      )}
    >
      <Icon size={18} aria-hidden="true" />
      <span className={cn("text-[9px]", active ? "font-bold" : "font-semibold")}>{label}</span>
    </Link>
  );
}

export default function AlunoBottomNav({ onMenuClick }: { onMenuClick: () => void }) {
  return (
    <nav
      aria-label="Navegação inferior"
      className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-vinke-line bg-white px-1 pb-[max(env(safe-area-inset-bottom),8px)] pt-1.5 lg:hidden dark:border-vinke-navy-line dark:bg-vinke-navy-deep"
    >
      <NavItem href="/aluno" label="Início" Icon={Home} />
      <NavItem href="/aluno/estudo-de-hoje" label="Estudo" Icon={Sparkles} />
      <NavItem href="/aluno/simulados" label="Simulados" Icon={Brain} />
      <NavItem href="/aluno/flashcards" label="Flashcards" Icon={Layers} />
      <button
        type="button"
        onClick={onMenuClick}
        className="flex flex-1 flex-col items-center gap-0.5 py-1 text-vinke-ink3"
      >
        <Menu size={18} aria-hidden="true" />
        <span className="text-[9px] font-semibold">Menu</span>
      </button>
    </nav>
  );
}
