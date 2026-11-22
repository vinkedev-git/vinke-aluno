// Embaralhamento determinístico das alternativas.
//
// Por que determinístico: a ordem precisa ser estável dentro de um mesmo
// contexto (a mesma questão na mesma sessão sempre aparece igual, inclusive
// ao voltar pelo mapa da prova), mas diferente entre sessões — o que impede
// o aluno de decorar a posição da resposta em treinos repetidos.
//
// A resposta continua sendo gravada pelo id original da alternativa (A–E do
// caderno oficial); só a ORDEM de exibição e a LETRA mostrada mudam.

function hashStr(s: string): number {
  // FNV-1a 32 bits
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffledOptions<T>(options: T[], seedKey: string): T[] {
  const arr = [...options];
  const rnd = mulberry32(hashStr(seedKey));
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Letra exibida pela POSIÇÃO na tela (não pelo id original).
export function optionLabel(index: number): string {
  return "ABCDEFGH"[index] ?? String(index + 1);
}

/**
 * Letra que o aluno VIU para uma alternativa: mesma ordenação por id do player
 * (A–E primeiro, depois números) e mesmo embaralhamento (`${sessionId}:${qid}`).
 * O resultado mostrava o id original do caderno ("Você: E · Certa: A") quando
 * no player o aluno tinha marcado a B.
 */
export function letraExibida(optionIds: string[], alvo: string, seedKey: string): string {
  if (!alvo) return "";
  const rank = (id: string) => {
    const k = id.toUpperCase();
    const i = ["A", "B", "C", "D", "E"].indexOf(k);
    if (i >= 0) return i;
    const n = Number(k);
    return Number.isFinite(n) ? 100 + n : 999;
  };
  const ordenados = [...optionIds].sort(
    (a, b) => rank(a) - rank(b) || a.localeCompare(b, "pt-BR", { sensitivity: "base" })
  );
  const exibidos = optionIds.length > 1 ? shuffledOptions(ordenados, seedKey) : ordenados;
  const idx = exibidos.findIndex((id) => id === alvo);
  return idx >= 0 ? optionLabel(idx) : alvo;
}
