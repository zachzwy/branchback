import "server-only";

import { MockOrchestrator } from "./mock";
import { createOllamaOrchestrator } from "./ollama";
import { createOpenAIOrchestrator } from "./openai";
import type { Orchestrator } from "./types";

type Mode = "mock" | "ollama" | "openai";

let cached: Orchestrator | null = null;
let cachedMode: Mode | null = null;

// Dev picks via ORCHESTRATOR_MODE=mock|ollama|openai in .env.local. When unset,
// default to `openai` if LLM_API_KEY is present (so a deployed instance with
// credentials Just Works), else `mock` so a fresh clone runs without any LLM.
function resolveMode(): Mode {
  const raw = process.env.ORCHESTRATOR_MODE?.toLowerCase();
  if (raw === "ollama" || raw === "openai" || raw === "mock") return raw;
  if (raw && raw.length > 0) {
    throw new Error(
      `Invalid ORCHESTRATOR_MODE "${raw}". Use mock | ollama | openai.`,
    );
  }
  return process.env.LLM_API_KEY ? "openai" : "mock";
}

export function getOrchestrator(): Orchestrator {
  const mode = resolveMode();
  if (cached && mode === cachedMode) return cached;
  switch (mode) {
    case "ollama":
      cached = createOllamaOrchestrator();
      break;
    case "openai":
      cached = createOpenAIOrchestrator();
      break;
    case "mock":
      cached = new MockOrchestrator();
      break;
  }
  cachedMode = mode;
  return cached;
}

export type {
  Orchestrator,
  OrchestratorAction,
  OrchestratorTurnInput,
  OrchestratorTurnResult,
} from "./types";
