"use client";

import { featureFlags } from "@/lib/featureFlags";
import { AlertTriangle } from "lucide-react";

/**
 * Banner amarelo no topo da tela quando o app está rodando em homologação.
 * Evita que alguém confunda staging com produção.
 */
export default function StagingBanner() {
  if (!featureFlags.staging) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-center gap-2 bg-amber-400 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-amber-950 shadow-lg">
      <AlertTriangle size={14} />
      <span>Ambiente de homologação — não é produção</span>
    </div>
  );
}
