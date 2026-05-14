import "server-only";

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getDataConnect,
  connectDataConnectEmulator,
  type DataConnect,
} from "firebase/data-connect";

const CONNECTOR_CONFIG = {
  connector: "default",
  service: "branchback",
  location: "us-central1",
} as const;

let cachedApp: FirebaseApp | null = null;
let cachedDc: DataConnect | null = null;
let emulatorWired = false;

function getServerFirebaseApp(): FirebaseApp {
  if (cachedApp) return cachedApp;
  const existing = getApps()[0];
  cachedApp = existing
    ? existing
    : initializeApp({
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "demo-key",
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId:
          process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??
          process.env.GOOGLE_CLOUD_PROJECT ??
          "branchback-dev",
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
        measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
      });
  return cachedApp;
}

export function getDc(): DataConnect {
  if (cachedDc) return cachedDc;
  cachedDc = getDataConnect(getServerFirebaseApp(), CONNECTOR_CONFIG);
  if (
    !emulatorWired &&
    process.env.NEXT_PUBLIC_USE_EMULATORS === "true"
  ) {
    const host =
      process.env.DATACONNECT_EMULATOR_HOST?.split(":")[0] ?? "127.0.0.1";
    const port = Number(
      process.env.DATACONNECT_EMULATOR_HOST?.split(":")[1] ?? "9399",
    );
    connectDataConnectEmulator(cachedDc, host, port);
    emulatorWired = true;
  }
  return cachedDc;
}
