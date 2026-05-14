import "server-only";

import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAdminApp } from "@/lib/firebase/admin";

// Module-scope state gets reset on Turbopack HMR, but the firebase-admin
// Firestore instance is cached one layer down (against the app), so calling
// .settings() a second time throws "already been initialized." Marking the
// instance itself means the flag rides on the same lifetime as the
// settings call it gates.
const SETTINGS_APPLIED = Symbol.for("branchback.firestore.settingsApplied");

interface MarkedFirestore extends Firestore {
  [SETTINGS_APPLIED]?: true;
}

export function getDb(): Firestore {
  const db = getFirestore(getAdminApp()) as MarkedFirestore;
  if (!db[SETTINGS_APPLIED]) {
    // Required: our domain types use `null` for optional fields explicitly,
    // but downstream callers occasionally pass `undefined` when assembling
    // payload patches. Firestore rejects undefined by default — flip it.
    db.settings({ ignoreUndefinedProperties: true });
    db[SETTINGS_APPLIED] = true;
  }
  return db;
}
