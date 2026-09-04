import { getApps, initializeApp, cert, App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function getAdminApp(): App {
  if (getApps().length > 0) return getApps()[0]!;

  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL ?? "";
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID ?? "";

  if (!privateKey || !clientEmail || !projectId) {
    throw new Error(
      "Firebase Admin: variáveis de ambiente ausentes (FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY)."
    );
  }

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}

// Inicialização preguiçosa: o build do Next importa as rotas de API para
// coletar metadados, e os segredos só existem em runtime.
export function getAdminAuth() {
  return getAuth(getAdminApp());
}

export function getAdminDb() {
  return getFirestore(getAdminApp());
}
