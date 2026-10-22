// Oferta do plano gratuito → pago. Fonte única de datas, preços e links de checkout
// usados pelo muro (limite diário), pelo dashboard e pelos e-mails do admin.

/** 1º dia do ENEM 2026 (edital 64/2026). Depois dessa data a oferta vira Anual. */
export const ENEM_DIA1 = new Date("2026-11-08T13:30:00-03:00");
export const ENEM_DIA2 = new Date("2026-11-15T13:30:00-03:00");

export const CHECKOUT = {
  passe: "https://sun.eduzz.com/G96RR56EW1",
  mensal: "https://sun.eduzz.com/1W322JN592",
  anual: "https://sun.eduzz.com/40QRRBZ19B",
} as const;

export const PRECO = {
  passe: "R$ 49,90",
  mensal: "R$ 34,90/mês",
  anual: "12x R$ 19,90",
} as const;

export const LP_PLANOS_URL = "https://vinke.app.br/#planos";

/** Dias inteiros até o 1º dia de prova (0 no dia; negativo depois). */
export function diasParaEnem(now = new Date()): number {
  return Math.ceil((ENEM_DIA1.getTime() - now.getTime()) / 86_400_000);
}

/** Antes do ENEM a oferta é o Passe; depois, o Anual. */
export function ofertaAtual(now = new Date()): {
  plano: "passe" | "anual";
  titulo: string;
  preco: string;
  detalhe: string;
  cta: string;
  url: string;
} {
  const dias = diasParaEnem(now);
  if (dias > 0) {
    return {
      plano: "passe",
      titulo: dias === 1 ? "Falta 1 dia para o ENEM" : `Faltam ${dias} dias para o ENEM`,
      preco: PRECO.passe,
      detalhe: "Passe Reta Final: tudo liberado até o fim da prova. Pagamento único, garantia de 7 dias.",
      cta: `Garantir o Passe por ${PRECO.passe}`,
      url: CHECKOUT.passe,
    };
  }
  return {
    plano: "anual",
    titulo: "Treine sem limite o ano inteiro",
    preco: PRECO.anual,
    detalhe: "Plano Anual: questões e simulados sem limite, plano diário e caderno de erros. Garantia de 7 dias.",
    cta: `Assinar o Anual por ${PRECO.anual}`,
    url: CHECKOUT.anual,
  };
}

/** Checkout da Eduzz com e-mail e nome pré-preenchidos (o Sun aceita ?email= e ?name=). */
export function checkoutUrl(base: string, opts: { email?: string | null; nome?: string | null; origem?: string }) {
  const u = new URL(base);
  if (opts.email) u.searchParams.set("email", opts.email);
  if (opts.nome) u.searchParams.set("name", opts.nome);
  u.searchParams.set("utm_source", "app");
  u.searchParams.set("utm_medium", opts.origem ?? "muro");
  return u.toString();
}

/** Rodapé do muro */
export const LIMITE_LABEL = "Garantia de 7 dias. Cancele quando quiser. Amanhã suas 10 questões grátis voltam.";
