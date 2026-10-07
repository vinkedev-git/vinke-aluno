"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";

/**
 * Meta Pixel do Vinke. Só carrega se NEXT_PUBLIC_META_PIXEL_ID estiver definido.
 * - PageView em toda navegação.
 * - InitiateCheckout em qualquer clique em link da Eduzz (sun.eduzz.com), com o
 *   nome do plano, sem precisar tocar nos componentes da página.
 * Eventos adicionais: chame `track("Lead")` etc. a partir de qualquer client component.
 */

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

// Códigos de checkout da Eduzz → nome legível do plano (para o evento).
const PLANOS: Record<string, { name: string; value: number }> = {
  "1W322JN592": { name: "Mensal", value: 34.9 },
  "40QRRBZ19B": { name: "Anual", value: 238.8 },
  G96RR56EW1: { name: "Passe Reta Final", value: 49.9 },
};

type Fbq = (...args: unknown[]) => void;
declare global {
  interface Window {
    fbq?: Fbq;
  }
}

export function track(event: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined" || !window.fbq) return;
  window.fbq("track", event, params);
}

export default function MetaPixel() {
  const pathname = usePathname();

  // PageView a cada troca de rota (o snippet já dispara o primeiro).
  useEffect(() => {
    if (!PIXEL_ID || !pathname) return;
    window.fbq?.("track", "PageView");
  }, [pathname]);

  // InitiateCheckout nos links da Eduzz.
  useEffect(() => {
    if (!PIXEL_ID) return;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.("a[href*='sun.eduzz.com']") as HTMLAnchorElement | null;
      if (!a) return;
      const code = a.href.split("/").pop()?.split("?")[0] ?? "";
      const plano = PLANOS[code];
      track("InitiateCheckout", {
        content_name: plano?.name ?? code,
        value: plano?.value,
        currency: "BRL",
      });
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  if (!PIXEL_ID) return null;

  return (
    <>
      <Script id="meta-pixel" strategy="afterInteractive">
        {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${PIXEL_ID}');fbq('track','PageView');`}
      </Script>
      <noscript>
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          alt=""
          src={`https://www.facebook.com/tr?id=${PIXEL_ID}&ev=PageView&noscript=1`}
        />
      </noscript>
    </>
  );
}
