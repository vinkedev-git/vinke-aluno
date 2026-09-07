// Testa as firestore.rules em produção com usuários sintéticos.
// Simula o que um aluno faria pelo console do navegador (SDK web),
// verificando a matriz permitido/negado do plano gratuito vs pago.
// Uso: node scripts/rules-test.mjs   (a partir de vinke-aluno/)

import { readFileSync } from "fs";
import { createRequire } from "module";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import {
  getFirestore, doc, collection, getDocs, writeBatch, serverTimestamp, query, limit,
} from "firebase/firestore";

const require = createRequire(import.meta.url);
const admin = require("firebase-admin");

const SA = "/Users/davidrangel/Projetos/EnemQuest/.secrets/vinke-74695-firebase-adminsdk-fbsvc-374e2db752.json";
admin.initializeApp({ credential: admin.credential.cert(require(SA)) });
const adb = admin.firestore();

// Config web (público) — lido do .env.local do app
const env = readFileSync(".env.local", "utf8");
const pick = (k) => (env.match(new RegExp(`${k}=(.*)`)) || [])[1]?.trim();
const app = initializeApp({
  apiKey: pick("NEXT_PUBLIC_FIREBASE_API_KEY"),
  authDomain: pick("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
  projectId: pick("NEXT_PUBLIC_FIREBASE_PROJECT_ID") || "vinke-74695",
});
const auth = getAuth(app);
const db = getFirestore(app);

const brt = () => new Date(Date.now() - 3 * 3600e3);
const diaKey = () => brt().toISOString().slice(0, 10);
const mesKey = () => brt().toISOString().slice(0, 7);

let passed = 0, failed = 0;
function check(nome, ok, extra = "") {
  if (ok) { passed++; console.log(`  ✓ ${nome}`); }
  else { failed++; console.log(`  ✗ FALHOU: ${nome} ${extra}`); }
}
const esperaNegado = async (nome, fn) => {
  try { await fn(); check(nome, false, "(foi PERMITIDO)"); }
  catch (e) { check(nome, String(e.code).includes("permission-denied"), `(${e.code})`); }
};
const esperaOk = async (nome, fn) => {
  try { await fn(); check(nome, true); }
  catch (e) { check(nome, false, `(${e.code || e.message})`); }
};

const sessData = () => ({
  title: "t", titleDisplay: "t", status: "in_progress",
  filters: { anos: [], areas: [], assuntos: [], provas: [], niveis: [], temas: [] },
  questionIds: ["ENEM2019_Q137"], totalQuestions: 1, currentIndex: 0,
  answeredCount: 0, correctCount: 0, wrongCount: 0, scorePercent: 0,
  updatedAt: serverTimestamp(), createdAt: serverTimestamp(),
});

async function criaUsuario(email, plan) {
  const u = await admin.auth().createUser({ email, password: "teste-rules-123" });
  await adb.doc(`entitlements/${u.uid}`).set({ active: true, plan, source: "teste-rules", updatedAt: new Date() });
  await adb.doc(`users/${u.uid}`).set({ uid: u.uid, email, createdAt: new Date() });
  return u.uid;
}
async function limpa(uid) {
  await admin.auth().deleteUser(uid).catch(() => {});
  const sess = await adb.collection(`users/${uid}/sessions`).get();
  for (const d of sess.docs) await d.ref.delete();
  await adb.doc(`users/${uid}/meta/planUso`).delete().catch(() => {});
  await adb.doc(`entitlements/${uid}`).delete();
  await adb.doc(`users/${uid}`).delete();
}

async function main() {
  const gEmail = "teste-rules-gratis@example.com";
  const pEmail = "teste-rules-pago@example.com";
  const gUid = await criaUsuario(gEmail, "gratuito");
  const pUid = await criaUsuario(pEmail, "mensal");
  console.log("usuários sintéticos criados");

  try {
    // ── GRATUITO ──────────────────────────────────────────────
    await signInWithEmailAndPassword(auth, gEmail, "teste-rules-123");
    console.log("\n[GRATUITO]");
    const planUso = doc(db, "users", gUid, "meta", "planUso");

    await esperaNegado("criar simulado SEM virada de mês", async () => {
      const b = writeBatch(db);
      b.set(doc(collection(db, "users", gUid, "sessions")), sessData());
      await b.commit();
    });

    const s1 = doc(collection(db, "users", gUid, "sessions"));
    await esperaOk("criar 1º simulado do mês COM virada", async () => {
      const b = writeBatch(db);
      b.set(s1, sessData());
      b.set(planUso, { simuladoMes: mesKey() }, { merge: true });
      await b.commit();
    });

    await esperaNegado("criar 2º simulado no mesmo mês", async () => {
      const b = writeBatch(db);
      b.set(doc(collection(db, "users", gUid, "sessions")), sessData());
      b.set(planUso, { simuladoMes: mesKey() }, { merge: true });
      await b.commit();
    });

    // 10 respostas válidas
    let ok10 = true;
    for (let i = 1; i <= 10; i++) {
      try {
        const b = writeBatch(db);
        b.update(s1, { answeredCount: i, [`answersMap.q${i}`]: { selectedOptionId: "A", isCorrect: false } });
        b.set(planUso, { diaKey: diaKey(), respostasDia: i }, { merge: true });
        await b.commit();
      } catch (e) { ok10 = false; console.log(`    resposta ${i}: ${e.code}`); break; }
    }
    check("10 respostas do dia passam", ok10);

    await esperaNegado("11ª resposta do dia", async () => {
      const b = writeBatch(db);
      b.update(s1, { answeredCount: 11, ["answersMap.q11"]: { selectedOptionId: "A", isCorrect: false } });
      b.set(planUso, { diaKey: diaKey(), respostasDia: 11 }, { merge: true });
      await b.commit();
    });

    await esperaNegado("resposta SEM incrementar o contador", async () => {
      const b = writeBatch(db);
      b.update(s1, { answeredCount: 11, ["answersMap.q11b"]: { selectedOptionId: "A", isCorrect: false } });
      await b.commit();
    });

    await esperaNegado("forjar reset do contador (respostasDia=1 no mesmo dia)", async () => {
      const b = writeBatch(db);
      b.set(planUso, { diaKey: diaKey(), respostasDia: 1 }, { merge: true });
      await b.commit();
    });

    await esperaOk("navegação na sessão (currentIndex) continua livre", async () => {
      const b = writeBatch(db);
      b.update(s1, { currentIndex: 1, updatedAt: serverTimestamp() });
      await b.commit();
    });

    await esperaNegado("ler flashcards no plano gratuito", async () => {
      await getDocs(query(collection(db, "flashcards"), limit(1)));
    });

    // ── PAGO ─────────────────────────────────────────────────
    await signInWithEmailAndPassword(auth, pEmail, "teste-rules-123");
    console.log("\n[PAGO]");

    await esperaOk("criar simulado sem contador", async () => {
      const b = writeBatch(db);
      b.set(doc(collection(db, "users", pUid, "sessions")), sessData());
      await b.commit();
    });
    await esperaOk("criar SEGUNDO simulado no mês", async () => {
      const b = writeBatch(db);
      b.set(doc(collection(db, "users", pUid, "sessions")), sessData());
      await b.commit();
    });
    await esperaOk("responder sem contador", async () => {
      const sess = await adb.collection(`users/${pUid}/sessions`).limit(1).get();
      const b = writeBatch(db);
      b.update(doc(db, "users", pUid, "sessions", sess.docs[0].id), { answeredCount: 1, ["answersMap.qx"]: { selectedOptionId: "A", isCorrect: true } });
      await b.commit();
    });
    await esperaOk("ler flashcards no plano pago", async () => {
      await getDocs(query(collection(db, "flashcards"), limit(1)));
    });

    console.log(`\nRESULTADO: ${passed} ok, ${failed} falhas`);
  } finally {
    await limpa(gUid);
    await limpa(pUid);
    console.log("usuários sintéticos removidos");
  }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
