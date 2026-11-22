"use client";
// Captura erros não tratados da área do aluno (JavaScript quebrado, promessa
// rejeitada) e manda para o registro de erros. Não renderiza nada.
import { useEffect } from "react";
import { registrarErro } from "@/lib/telemetria";

export default function CapturaErros() {
  useEffect(() => {
    const onError = (ev: ErrorEvent) => {
      // erro de extensão do navegador ou script de terceiros sem detalhe: ignora
      if (!ev.message || ev.message === "Script error.") return;
      registrarErro("js", ev.error ?? ev.message, { arquivo: ev.filename, linha: ev.lineno });
    };
    const onRejeicao = (ev: PromiseRejectionEvent) => registrarErro("promessa", ev.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejeicao);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejeicao);
    };
  }, []);
  return null;
}
