import type {
  ConversationMessage,
  PhaseKey,
  PlanningDepth,
  ProductStoryPayload,
  RecommendationOption,
} from "@/lib/db/types";

export type CapabilityTier =
  | "classification"
  | "summarization"
  | "structured_extraction"
  | "decision_graph_mutation"
  | "reasoning"
  | "long_context_synthesis"
  | "high_stakes_synthesis";

export type OrchestratorAction =
  | {
      type: "ask_question";
      payload: { text: string; phaseKey: PhaseKey };
    }
  | {
      type: "recommend_option";
      payload: {
        phaseKey: PhaseKey;
        prompt: string;
        recommended: RecommendationOption;
        alternative: RecommendationOption;
        actions: ["go_with_recommended", "choose_alternative", "not_sure"];
      };
    };

export interface OrchestratorTurnInput {
  userId: string;
  projectId: string;
  planningDepth: PlanningDepth;
  currentPhaseKey: PhaseKey;
  depthPolicy: {
    phaseQuestionCount: number;
    phaseQuestionBudget: number;
    atOrOverBudget: boolean;
    guidance: string;
    exitCriteria: string[];
  };
  turnIndex: number;
  userMessage?: { text: string };
  productStory: ProductStoryPayload;
  recentMessages: Pick<
    ConversationMessage,
    "id" | "role" | "kind" | "payload" | "turnIndex" | "createdAt"
  >[];
}

export interface OrchestratorGenerationMeta {
  module: string;
  capabilityTier: CapabilityTier;
  routingPolicy: "mock" | "ollama_local" | "openai_compatible";
  providerId: "mock" | "ollama" | "openai";
  modelId: string;
  promptVersion: string;
  inputHash: string;
  outputHash: string;
  providerCallStatus: "success" | "failed" | "timeout" | "rate_limited";
  validatorStatus:
    | "passed"
    | "failed"
    | "repaired"
    | "needs_user_confirmation"
    | "rejected";
  latencyMs: number;
}

export interface OrchestratorTurnResult {
  actions: OrchestratorAction[];
  generation: OrchestratorGenerationMeta;
}

export interface Orchestrator {
  runTurn(input: OrchestratorTurnInput): Promise<OrchestratorTurnResult>;
}
