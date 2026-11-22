"use client";
// O app das lojas (vinke-mobile, Capacitor) abre este site e acrescenta
// "VinkeApp/ios" ou "VinkeApp/android" ao user agent.
//
// Dentro do app NÃO mostramos compra: Apple e Google exigem o pagamento
// delas (15–30%) para assinatura de conteúdo digital vendida no app, e
// mandar o aluno pagar por fora pode reprovar o app. A venda continua pelo
// site (navegador). Quem já pagou usa tudo normalmente no app.
import { useSyncExternalStore } from "react";

export function dentroDoApp(): boolean {
  return typeof navigator !== "undefined" && /VinkeApp\//.test(navigator.userAgent);
}

const semAssinatura = () => () => {};

/** false no servidor e na hidratação; true logo em seguida dentro do app. */
export function useDentroDoApp(): boolean {
  return useSyncExternalStore(semAssinatura, dentroDoApp, () => false);
}
