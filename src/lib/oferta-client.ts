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

// diferença em dias de calendário no fuso de Brasília (UTC-3)
const diaBRT = (d: Date) => Math.floor((d.getTime() - 3 * 3_600_000) / 86_400_000);

/** Dias inteiros até o 1º dia de prova (0 no dia; negativo depois). */
export function diasParaEnem(now = new Date()): number {
  return diaBRT(ENEM_DIA1) - diaBRT(now);
}

/**
 * Próximo dia de prova que ainda vale treinar: o 1º dia até 7/11 e o 2º dia
 * (Matemática e Natureza) de 8/11 a 14/11. null a partir do dia 15.
 */
export function proximaProva(now = new Date()): { dia: 1 | 2; dias: number } | null {
  const d1 = diaBRT(ENEM_DIA1) - diaBRT(now);
  if (d1 > 0) return { dia: 1, dias: d1 };
  const d2 = diaBRT(ENEM_DIA2) - diaBRT(now);
  if (d2 > 0) return { dia: 2, dias: d2 };
  return null;
}

/** Até a véspera do 2º dia a oferta é o Passe; depois, o Anual. */
export function ofertaAtual(now = new Date()): {
  plano: "passe" | "anual";
  titulo: string;
  preco: string;
  detalhe: string;
  cta: string;
  url: string;
} {
  const prova = proximaProva(now);
  if (prova) {
    const { dia, dias } = prova;
    const alvo = dia === 1 ? "o ENEM" : "o 2º dia do ENEM";
    return {
      plano: "passe",
      titulo: dias === 1 ? `Falta 1 dia para ${alvo}` : `Faltam ${dias} dias para ${alvo}`,
      preco: PRECO.passe,
      detalhe:
        dia === 1
          ? "Passe Reta Final: tudo liberado até o fim da prova. Pagamento único, garantia de 7 dias."
          : "Passe Reta Final: Matemática e Natureza sem limite até o 2º dia, com simulados no tempo da prova. Pagamento único, garantia de 7 dias.",
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

// ─── Vinke aberto ───────────────────────────────────────────────────────────
// De 16/11/2026 a 31/01/2027 o plano gratuito tem TUDO liberado (turma 2027).
// A mesma janela está nas firestore.rules (vinkeAberto) e no admin
// (emailsGratuito.ts). Mudou aqui, muda lá.
export const VINKE_ABERTO_INICIO = new Date("2026-11-16T00:00:00-03:00");
export const VINKE_ABERTO_FIM = new Date("2027-02-01T00:00:00-03:00"); // exclusivo
export const VINKE_ABERTO_FIM_LABEL = "31 de janeiro";
export function vinkeAbertoAtivo(now = new Date()): boolean {
  return now >= VINKE_ABERTO_INICIO && now < VINKE_ABERTO_FIM;
}
