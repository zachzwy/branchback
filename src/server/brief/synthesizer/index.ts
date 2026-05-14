import "server-only";

import { MockBriefSynthesizer } from "./mock";
import { createOllamaBriefSynthesizer } from "./ollama";
import { createOpenAIBriefSynthesizer } from "./openai";
import type { BriefSynthesizer } from "./types";

type Mode = "mock" | "ollama" | "openai";

let cached: BriefSynthesizer | null = null;
let cachedMode: Mode | null = null;

// Mirrors orchestrator/index.ts: BRIEF_SYNTHESIS_MODE picks mock|ollama|openai.
// When unset, default to `openai` if LLM_API_KEY is present, else `mock`.
function resolveMode(): Mode {
  const raw = process.env.BRIEF_SYNTHESIS_MODE?.toLowerCase();
  if (raw === "ollama" || raw === "openai" || raw === "mock") return raw;
  if (raw && raw.length > 0) {
    throw new Error(
      `Invalid BRIEF_SYNTHESIS_MODE "${raw}". Use mock | ollama | openai.`,
    );
  }
  return process.env.LLM_API_KEY ? "openai" : "mock";
}

export function getBriefSynthesizer(): BriefSynthesizer {
  const mode = resolveMode();
  if (cached && mode === cachedMode) return cached;
  switch (mode) {
    case "ollama":
      cached = createOllamaBriefSynthesizer();
      break;
    case "openai":
      cached = createOpenAIBriefSynthesizer();
      break;
    case "mock":
      cached = new MockBriefSynthesizer();
      break;
  }
  cachedMode = mode;
  return cached;
}

export type {
  BriefSynthesisInput,
  BriefSynthesisOutput,
  BriefSynthesizer,
} from "./types";
export { decisionRecordsForSynth } from "./_shared";
