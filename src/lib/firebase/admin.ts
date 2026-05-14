import "server-only";

import {
  getApps,
  initializeApp,
  cert,
  applicationDefault,
  type App,
} from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";

let cachedApp: App | null = null;

function loadServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const decoded = raw.trim().startsWith("{")
      ? raw
      : Buffer.from(raw, "base64").toString("utf-8");
    return JSON.parse(decoded);
  } catch (err) {
    throw new Error(
      `FIREBASE_SERVICE_ACCOUNT_JSON could not be parsed: ${(err as Error).message}`,
    );
  }
}

export function getAdminApp(): App {
  if (cachedApp) return cachedApp;
  const existing = getApps()[0];
  if (existing) {
    cachedApp = existing;
    return cachedApp;
  }
  const serviceAccount = loadServiceAccount();
  cachedApp = initializeApp({
    credential: serviceAccount ? cert(serviceAccount) : applicationDefault(),
    projectId:
      serviceAccount?.project_id ??
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??
      process.env.GOOGLE_CLOUD_PROJECT,
  });
  return cachedApp;
}

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}
