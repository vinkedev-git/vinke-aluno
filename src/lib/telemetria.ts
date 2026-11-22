"use client";
// Envia um erro do app para /api/telemetria/erro (coleção client_errors).
// Best-effort: nunca lança, não repete a mesma mensagem na mesma aba e para
// depois de 15 envios por aba para não inundar o banco.
import { auth } from "@/lib/firebase";

const vistos = new Set<string>();
let enviados = 0;

export function registrarErro(tipo: string, erro: unknown, contexto?: Record<string, unknown>) {
  try {
    if (typeof window === "undefined" || enviados >= 15) return;
    const e = erro as { message?: unknown; stack?: unknown; code?: unknown } | null;
    const mensagem = String(e?.message ?? erro ?? "").slice(0, 500);
    const chave = `${tipo}|${mensagem}`;
    if (vistos.has(chave)) return;
    vistos.add(chave);
    enviados += 1;
    const corpo = {
      tipo,
      mensagem: e?.code ? `[${String(e.code)}] ${mensagem}` : mensagem,
      stack: typeof e?.stack === "string" ? e.stack.slice(0, 1500) : null,
      rota: window.location.pathname,
      contexto: contexto ?? null,
    };
    const u = auth.currentUser;
    const enviar = (token?: string) =>
      fetch("/api/telemetria/erro", {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(corpo),
      }).catch(() => {});
    if (u) u.getIdToken().then(enviar, () => enviar());
    else void enviar();
  } catch {
    // nada: telemetria nunca quebra a tela
  }
}
