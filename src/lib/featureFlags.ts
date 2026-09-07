/**
 * Feature Flags — controla quais features estão visíveis para os usuários.
 *
 * IMPORTANTE: o Next.js só substitui variáveis NEXT_PUBLIC_* no client quando
 * elas são acessadas DIRETAMENTE (process.env.NEXT_PUBLIC_FOO), não via
 * variável intermediária (process.env[name]). Por isso cada flag aqui é
 * declarada de forma estática.
 *
 * Como usar:
 *   import { featureFlags } from "@/lib/featureFlags";
 *   if (featureFlags.flashcards) {
 *     // mostra a feature
 *   }
 *
 * Para ativar uma flag:
 *   - Em desenvolvimento (.env.local): NEXT_PUBLIC_FF_FLASHCARDS=true
 *   - No Vercel: Settings → Environment Variables → adicione a variável
 *     e escolha o environment (Production, Preview, Development).
 *   - Após adicionar a variável, é preciso fazer um redeploy SEM cache
 *     (ou push de novo commit) para o Next regenerar o bundle com o novo valor.
 *
 * Padrão de ativação:
 *   - Adicione a flag em "Preview" (homologação) primeiro
 *   - Teste em homolog.vinke.app.br
 *   - Quando estiver pronto, adicione em "Production" também
 */

const isTrue = (v: string | undefined) => v === "true" || v === "1";

export const featureFlags = {
  /** Sistema de flashcards — ligado por padrão no Vinke; defina
   *  NEXT_PUBLIC_FF_FLASHCARDS=false para desligar em emergência. */
  flashcards: process.env.NEXT_PUBLIC_FF_FLASHCARDS === undefined
    ? true
    : isTrue(process.env.NEXT_PUBLIC_FF_FLASHCARDS),

  /** Indica que estamos em ambiente de homologação (mostra banner amarelo) */
  staging: isTrue(process.env.NEXT_PUBLIC_FF_STAGING),
} as const;

export type FeatureFlag = keyof typeof featureFlags;
