import "server-only";

import { DataConnectRepository } from "./dataconnect/repository";
import { FirestoreRepository } from "./firestore/repository";
import { InMemoryRepository } from "./memory";
import type { Repository } from "./repository";

declare global {
  // eslint-disable-next-line no-var
  var __branchbackRepository: Repository | undefined;
  // eslint-disable-next-line no-var
  var __branchbackRepositoryMode: string | undefined;
  // eslint-disable-next-line no-var
  var __branchbackRepositoryModuleId: symbol | undefined;
}

// Each evaluation of this module gets a fresh symbol. In dev with Turbopack /
// HMR, the module re-runs whenever a backend file changes, which gives us a
// new MODULE_ID — so the cached repository instance (constructed from the
// previous module's classes) is treated as stale and rebuilt. In production
// the module evaluates once, so the symbol is stable and the instance is
// cached for the process lifetime.
const MODULE_ID = Symbol("branchbackRepositoryModule");

// Static imports above instead of CJS `require()` — Turbopack's ESM-via-CJS
// interop wraps named exports under a `default` key, so the destructure
// silently returns `undefined` and `new` blows up at runtime. The bundle
// cost is trivial: DataConnectRepository's module deliberately doesn't
// import `firebase/data-connect` at module load (the commented-out imports
// are activated per-method), and FirestoreRepository pulls in firebase-admin
// which we already need for Auth.

function build(mode: string): Repository {
  switch (mode) {
    case "firestore":
      return new FirestoreRepository();
    case "dataconnect":
      return new DataConnectRepository();
    case "memory":
    default:
      return new InMemoryRepository();
  }
}

export function getRepository(): Repository {
  const mode = (process.env.REPOSITORY_MODE ?? "firestore").toLowerCase();
  if (
    !globalThis.__branchbackRepository ||
    globalThis.__branchbackRepositoryMode !== mode ||
    globalThis.__branchbackRepositoryModuleId !== MODULE_ID
  ) {
    globalThis.__branchbackRepository = build(mode);
    globalThis.__branchbackRepositoryMode = mode;
    globalThis.__branchbackRepositoryModuleId = MODULE_ID;
  }
  return globalThis.__branchbackRepository;
}

export type { Repository } from "./repository";
