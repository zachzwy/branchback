import "server-only";

import { sha256 } from "@/server/hashing";
import type {
  Orchestrator,
  OrchestratorAction,
  OrchestratorGenerationMeta,
  OrchestratorTurnInput,
  OrchestratorTurnResult,
} from "./types";

const MODEL_ID = "mock-v1";
const PROMPT_VERSION = "mock.v1";

function meta(
  input: OrchestratorTurnInput,
  actions: OrchestratorAction[],
  module: string,
): OrchestratorGenerationMeta {
  return {
    module,
    capabilityTier: "structured_extraction",
    routingPolicy: "mock",
    providerId: "mock",
    modelId: MODEL_ID,
    promptVersion: PROMPT_VERSION,
    inputHash: sha256(input),
    outputHash: sha256(actions),
    providerCallStatus: "success",
    validatorStatus: "passed",
    latencyMs: 1,
  };
}

function questionTurn(input: OrchestratorTurnInput): OrchestratorTurnResult {
  const actions: OrchestratorAction[] = [
    {
      type: "ask_question",
      payload: {
        phaseKey: "user_narrowing",
        text: "Got it. Quick first question to sharpen this — who specifically do you have in mind as the first user? Students learning to code, working developers switching domains, or career switchers coming from outside tech?",
      },
    },
  ];
  return { actions, generation: meta(input, actions, "question_strategist") };
}

function recommendationTurn(
  input: OrchestratorTurnInput,
): OrchestratorTurnResult {
  const actions: OrchestratorAction[] = [
    {
      type: "recommend_option",
      payload: {
        phaseKey: "user_narrowing",
        prompt:
          "I see two quite different groups in what you described — and the product you build would look very different depending on which one you're solving for.",
        recommended: {
          id: "career_switchers",
          title: "Coding career switchers",
          rationale:
            "Career switchers have the highest urgency, the clearest definition of done (getting hired), and are the easiest to validate quickly.",
          confidence: 0.78,
        },
        alternative: {
          id: "curious_learners",
          title: "Curious learners",
          rationale:
            "Interest-driven. Broader audience, lower urgency — and much harder to retain.",
          confidence: 0.55,
        },
        actions: [
          "go_with_recommended",
          "choose_alternative",
          "not_sure",
        ],
      },
    },
  ];
  return { actions, generation: meta(input, actions, "recommendation") };
}

export class MockOrchestrator implements Orchestrator {
  async runTurn(input: OrchestratorTurnInput): Promise<OrchestratorTurnResult> {
    // Slice script: first user turn (no userMessage yet) → ask question.
    // After any user answer → emit recommendation.
    if (!input.userMessage) return questionTurn(input);
    return recommendationTurn(input);
  }
}
