"use client";

// Origem do cadastro. Fonte principal: cookie vk_origem gravado pela LP
// (vinke-lp/src/components/CapturaOrigem.tsx) no domínio .vinke.app.br.
// Se o aluno chegou direto no cadastro com utm na URL (e-mail, bio do
// Instagram), a URL vale mais que o cookie.
const UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

export type Origem = Partial<Record<(typeof UTM)[number] | "clid" | "referrer" | "landing" | "em", string>>;

export function lerOrigem(): Origem | null {
  if (typeof window === "undefined") return null;
  try {
    const q = new URLSearchParams(window.location.search);
    const daUrl: Origem = {};
    for (const k of UTM) {
      const v = q.get(k);
      if (v) daUrl[k] = v.slice(0, 120);
    }
    if (Object.keys(daUrl).length > 0) {
      return { ...daUrl, landing: window.location.pathname, em: new Date().toISOString() };
    }
    const m = document.cookie.match(/(?:^|; )vk_origem=([^;]*)/);
    if (m) return JSON.parse(decodeURIComponent(m[1])) as Origem;
    if (document.referrer) {
      const h = new URL(document.referrer).hostname;
      return { referrer: h.endsWith("vinke.app.br") ? "direto" : h, landing: window.location.pathname };
    }
  } catch {
    // best-effort
  }
  return null;
}

export const ANOS_ENEM = [
  { valor: "2026", label: "2026" },
  { valor: "2027", label: "2027" },
  { valor: "2028+", label: "2028 ou depois" },
  { valor: "nao-sei", label: "Ainda não sei" },
] as const;
