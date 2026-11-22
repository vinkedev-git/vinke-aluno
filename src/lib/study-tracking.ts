// Camada de serviço de acompanhamento de estudo.
// A cada resposta de questão, atualiza:
//  1) users/{uid}/meta/stats  → estatísticas agregadas (baratas de ler depois)
//  2) users/{uid}/errorNotebook/{questionId} → Caderno de Erros
//
// É chamado de forma não-bloqueante (void) após a resposta ser persistida,
// para não atrasar a UI nem comprometer a escrita principal da sessão.

import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp, increment } from "firebase/firestore";

type RawQuestion = Record<string, unknown> & { id: string };

function safeStr(v: unknown): string {
  return String(v ?? "").trim();
}

function extractThemes(q: RawQuestion): string[] {
  const arr: string[] = [];
  if (Array.isArray(q.themes)) arr.push(...q.themes.map(safeStr).filter(Boolean));
  if (Array.isArray(q.temas)) arr.push(...q.temas.map(safeStr).filter(Boolean));
  [q.tema, q.theme, q.topic].map(safeStr).filter(Boolean).forEach((t) => arr.push(t));
  return [...new Set(arr)];
}

function getStatement(q: RawQuestion): string {
  return safeStr(
    q.enunciado ?? q.statement ?? q.prompt ?? q.pergunta ?? q.title ?? q.text ?? q.question
  );
}

function plainSnippet(raw: string, max = 220): string {
  const text = raw
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? text.slice(0, max).trimEnd() + "…" : text;
}

/**
 * Dia no fuso de BRASÍLIA (UTC-3), formato YYYY-MM-DD — o mesmo das
 * firestore.rules (diaHoje) e do contador planUso. Antes usava a data do
 * celular: em Manaus/Acre, ou com relógio errado, a tela e o servidor
 * discordavam sobre "hoje" (bloqueio inesperado quando os limites voltarem).
 */
export function dayKey(d = new Date()): string {
  const b = new Date(d.getTime() - 3 * 3_600_000);
  const m = String(b.getUTCMonth() + 1).padStart(2, "0");
  const day = String(b.getUTCDate()).padStart(2, "0");
  return `${b.getUTCFullYear()}-${m}-${day}`;
}

// ─── Sequência única de estudo ──────────────────────────────────────────────
// Um dia conta para a sequência se o aluno respondeu questão OU estudou
// flashcard. Os dias de folga (fora de "Dias de estudo" nas Configurações)
// não quebram a sequência; estudar num dia de folga também conta.
// Campos em meta/stats: streakCount, streakLastDay, longestStreak e
// diasEstudados (últimos dias com estudo, para o resumo da semana).

const DIAS_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

function keyParaUtc(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}

function somarDias(key: string, n: number): string {
  const t = new Date(keyParaUtc(key) + n * 86_400_000);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

/** Nome do dia da semana ("segunda"...) de uma chave YYYY-MM-DD. */
export function diaDaSemana(key: string): string {
  return DIAS_SEMANA[new Date(keyParaUtc(key)).getUTCDay()];
}

/** Sem dias escolhidos (ou configuração antiga) = todos os dias contam. */
export function ehDiaDeEstudo(key: string, diasEstudo?: string[] | null): boolean {
  if (!diasEstudo || diasEstudo.length === 0) return true;
  return diasEstudo.includes(diaDaSemana(key));
}

/**
 * A sequência segue viva se, entre o último dia estudado e hoje, só houve
 * dias de folga. Teto de 14 dias de folga seguidos.
 */
function sequenciaViva(ultimo: string, hoje: string, diasEstudo?: string[] | null): boolean {
  if (!ultimo) return false;
  if (ultimo >= hoje) return ultimo === hoje;
  let k = somarDias(ultimo, 1);
  for (let i = 0; i < 14 && k < hoje; i++) {
    if (ehDiaDeEstudo(k, diasEstudo)) return false;
    k = somarDias(k, 1);
  }
  return k === hoje;
}

function lerDiasEstudo(settings: Record<string, unknown> | null | undefined): string[] | null {
  const v = settings?.studyDays;
  return Array.isArray(v) ? v.map((x) => String(x)) : null;
}

// Dias de estudo do aluno, lidos uma vez a cada 5 min (cada resposta
// precisaria de mais uma leitura).
const cacheDias = new Map<string, { em: number; dias: string[] | null }>();
async function diasEstudoDe(uid: string): Promise<string[] | null> {
  const c = cacheDias.get(uid);
  if (c && Date.now() - c.em < 5 * 60_000) return c.dias;
  try {
    const snap = await getDoc(doc(db, "users", uid, "meta", "settings"));
    const dias = lerDiasEstudo(snap.exists() ? (snap.data() as Record<string, unknown>) : null);
    cacheDias.set(uid, { em: Date.now(), dias });
    return dias;
  } catch {
    return null;
  }
}

/** Chamar depois de salvar as Configurações. */
export function esquecerDiasEstudo(uid: string) {
  cacheDias.delete(uid);
}

/** Campos da sequência a gravar em meta/stats quando o aluno estuda hoje. */
function marcarDiaEstudado(prev: Record<string, unknown>, diasEstudo: string[] | null) {
  const hoje = dayKey();
  const ultimo = safeStr(prev.streakLastDay);
  let streakCount = Number(prev.streakCount ?? 0) || 0;
  if (ultimo !== hoje) {
    streakCount = sequenciaViva(ultimo, hoje, diasEstudo) ? streakCount + 1 : 1;
  }
  const anteriores = Array.isArray(prev.diasEstudados) ? prev.diasEstudados.map(safeStr) : [];
  const diasEstudados = Array.from(new Set([...anteriores, hoje])).sort().slice(-14);
  return {
    streakCount,
    streakLastDay: hoje,
    longestStreak: Math.max(Number(prev.longestStreak ?? 0) || 0, streakCount),
    diasEstudados,
  };
}

/**
 * Semana atual (segunda a domingo, Brasília): quantos dias de estudo
 * planejados já passaram ou são hoje, e em quantos dias o aluno estudou.
 */
export function resumoSemana(
  stats: Record<string, unknown> | null | undefined,
  settings: Record<string, unknown> | null | undefined
) {
  const hoje = dayKey();
  const diasEstudo = lerDiasEstudo(settings);
  const dow = new Date(keyParaUtc(hoje)).getUTCDay(); // 0 = domingo
  const segunda = somarDias(hoje, -((dow + 6) % 7));
  const estudados = new Set(Array.isArray(stats?.diasEstudados) ? stats!.diasEstudados.map(safeStr) : []);
  const semana = Array.from({ length: 7 }, (_, i) => somarDias(segunda, i));
  const planejados = semana.filter((k) => ehDiaDeEstudo(k, diasEstudo));
  return {
    planejadosNaSemana: planejados.length,
    estudadosNaSemana: semana.filter((k) => k <= hoje && estudados.has(k)).length,
    hojeEhFolga: !ehDiaDeEstudo(hoje, diasEstudo),
  };
}

/**
 * Leitura dos contadores do DIA a partir de users/{uid}/meta/stats.
 * todayAnswered/todayCorrect/todayFlashcards só são de hoje se a chave do dia
 * bater — sem isso o Início mostrava de manhã os números de ontem.
 * A sequência só está viva se o aluno estudou hoje ou se, desde o último dia
 * estudado, só houve dias de folga; senão é 0 (antes aparecia "12 dias" e
 * virava 1 quando o aluno respondia). Passe `settings` (meta/settings) para
 * respeitar os dias de estudo do aluno.
 */
export function lerHoje(
  stats: Record<string, unknown> | null | undefined,
  settings?: Record<string, unknown> | null
) {
  const s = stats ?? {};
  const hoje = dayKey();
  const ehHoje = safeStr(s.todayKey) === hoje;
  const ultimo = safeStr(s.streakLastDay);
  // viva se estudou hoje ou se, desde o último dia estudado, só houve folgas
  const diasEstudo = lerDiasEstudo(settings);
  const viva = sequenciaViva(ultimo, hoje, diasEstudo);
  return {
    questoes: ehHoje ? Number(s.todayAnswered ?? 0) || 0 : 0,
    certas: ehHoje ? Number(s.todayCorrect ?? 0) || 0 : 0,
    flashcards: safeStr(s.todayFlashcardsKey) === hoje ? Number(s.todayFlashcards ?? 0) || 0 : 0,
    sequencia: viva ? Number(s.streakCount ?? 0) || 0 : 0,
    melhorSequencia: Math.max(Number(s.longestStreak ?? 0) || 0, viva ? Number(s.streakCount ?? 0) || 0 : 0),
  };
}

/** Sequência atual (única) do aluno, já respeitando os dias de folga. */
export async function lerSequenciaAtual(uid: string): Promise<number> {
  const [st, se] = await Promise.all([
    getDoc(doc(db, "users", uid, "meta", "stats")),
    getDoc(doc(db, "users", uid, "meta", "settings")),
  ]);
  return lerHoje(
    st.exists() ? (st.data() as Record<string, unknown>) : null,
    se.exists() ? (se.data() as Record<string, unknown>) : null
  ).sequencia;
}

/** Incrementa o contador de flashcards estudados hoje nas stats. */
export async function recordFlashcardSession(uid: string, count: number): Promise<void> {
  if (!uid || count <= 0) return;
  try {
    const statsRef = doc(db, "users", uid, "meta", "stats");
    const snap = await getDoc(statsRef);
    const prev = snap.exists() ? (snap.data() as Record<string, unknown>) : {};
    const today = dayKey();
    // Chave PRÓPRIA. `todayKey` é do contador de questões (recordAnswer o
    // escreve, e plano.ts o usa para saber se todayAnswered é de hoje).
    // Escrever nele aqui faria o plano tratar as questões de ONTEM como de
    // hoje sempre que o aluno abrisse o dia pelos flashcards.
    const isNewDay = safeStr(prev.todayFlashcardsKey) !== today;
    const todayFlashcards = isNewDay ? count : (Number(prev.todayFlashcards ?? 0) + count);
    // flashcard também é dia de estudo: entra na sequência única
    const sequencia = marcarDiaEstudado(prev, await diasEstudoDe(uid));
    await setDoc(
      statsRef,
      { todayFlashcards, todayFlashcardsKey: today, ...sequencia, updatedAt: serverTimestamp() },
      { merge: true }
    );
  } catch (e) {
    console.error("[study-tracking] falha ao atualizar flashcards do dia:", e);
  }
}

/**
 * Incrementa o contador de erros do caderno revisados hoje.
 * Chave de dia PRÓPRIA (`todayErrorsKey`), pelo mesmo motivo dos flashcards:
 * escrever em `todayKey` faria o plano tratar as questões de ontem como de hoje.
 */
export async function recordErrorReview(uid: string, count = 1): Promise<void> {
  if (!uid || count <= 0) return;
  try {
    const statsRef = doc(db, "users", uid, "meta", "stats");
    const snap = await getDoc(statsRef);
    const prev = snap.exists() ? (snap.data() as Record<string, unknown>) : {};
    const today = dayKey();
    const isNewDay = safeStr(prev.todayErrorsKey) !== today;
    const todayErrors = isNewDay ? count : (Number(prev.todayErrors ?? 0) + count);
    await setDoc(
      statsRef,
      { todayErrors, todayErrorsKey: today, updatedAt: serverTimestamp() },
      { merge: true }
    );
  } catch (e) {
    console.error("[study-tracking] falha ao atualizar erros do dia:", e);
  }
}

export type RecordAnswerInput = {
  uid: string;
  question: RawQuestion;
  isCorrect: boolean;
  selectedOptionId: string | null;
  correctOptionId: string | null;
};

/**
 * Registra uma resposta nas estatísticas agregadas e no caderno de erros.
 * Best-effort: falhas são logadas mas não propagadas.
 */
export async function recordAnswer(input: RecordAnswerInput): Promise<void> {
  const { uid, question, isCorrect, selectedOptionId, correctOptionId } = input;
  const qid = safeStr(question.id);
  if (!uid || !qid) return;

  const temas = extractThemes(question);

  // 1) Estatísticas agregadas + streak
  try {
    const statsRef = doc(db, "users", uid, "meta", "stats");
    const statsSnap = await getDoc(statsRef);
    const prev = statsSnap.exists() ? (statsSnap.data() as Record<string, unknown>) : {};

    // Sequência única (questões + flashcards, respeitando os dias de folga)
    const today = dayKey();
    const sequencia = marcarDiaEstudado(prev, await diasEstudoDe(uid));

    const byTheme: Record<string, { total: ReturnType<typeof increment>; correct: ReturnType<typeof increment> }> = {};
    for (const t of temas) {
      byTheme[t] = { total: increment(1), correct: increment(isCorrect ? 1 : 0) };
    }

    // Contadores diários: reset quando muda o dia. Usa a chave das QUESTÕES:
    // streakLastDay agora também é escrito pelos flashcards.
    const isNewDay = safeStr(prev.todayKey) !== today;
    const todayAnswered = isNewDay ? 1 : (Number(prev.todayAnswered ?? 0) + 1);
    const todayCorrect = isNewDay ? (isCorrect ? 1 : 0) : (Number(prev.todayCorrect ?? 0) + (isCorrect ? 1 : 0));

    await setDoc(
      statsRef,
      {
        totalAnswered: increment(1),
        totalCorrect: increment(isCorrect ? 1 : 0),
        ...(temas.length ? { byTheme } : {}),
        ...sequencia,
        todayAnswered,
        todayCorrect,
        todayKey: today,
        lastAnswerAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (e) {
    console.error("[study-tracking] falha ao atualizar stats:", e);
  }

  // 2) Caderno de erros
  try {
    const errRef = doc(db, "users", uid, "errorNotebook", qid);
    const snap = await getDoc(errRef);
    const exists = snap.exists();
    // Vale como revisão do caderno se a questão já estava pendente ANTES desta
    // resposta — acertando (resolve) ou errando (continua pendente). É o que
    // alimenta a dose diária de erros no /estudo-de-hoje.
    const eraPendente =
      exists && safeStr((snap.data() as Record<string, unknown>).status ?? "pending") === "pending";

    if (!isCorrect) {
      // Errou → entra (ou volta) para pendente
      if (!exists) {
        await setDoc(errRef, {
          questionId: qid,
          temas,
          enunciadoSnippet: plainSnippet(getStatement(question)),
          correctOptionId: correctOptionId || null,
          lastSelectedOptionId: selectedOptionId || null,
          timesWrong: 1,
          timesCorrect: 0,
          status: "pending",
          createdAt: serverTimestamp(),
          lastWrongAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(
          errRef,
          {
            temas,
            enunciadoSnippet: plainSnippet(getStatement(question)),
            correctOptionId: correctOptionId || null,
            lastSelectedOptionId: selectedOptionId || null,
            timesWrong: increment(1),
            status: "pending",
            lastWrongAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
    } else if (exists) {
      // Acertou uma questão que estava no caderno → resolvida
      await setDoc(
        errRef,
        {
          timesCorrect: increment(1),
          status: "resolved",
          resolvedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }

    if (eraPendente) await recordErrorReview(uid, 1);
  } catch (e) {
    console.error("[study-tracking] falha ao atualizar caderno de erros:", e);
  }
}
