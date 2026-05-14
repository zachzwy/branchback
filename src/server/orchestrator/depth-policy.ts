import "server-only";

import type {
  ConversationMessage,
  PhaseKey,
  PlanningDepth,
} from "@/lib/db/types";
import type { OrchestratorTurnInput } from "./types";

type DepthPolicy = {
  defaultQuestionBudget: number;
  phaseQuestionBudget: Partial<Record<PhaseKey, number>>;
  guidance: string;
  exitCriteria: string[];
};

const DEPTH_POLICIES: Record<PlanningDepth, DepthPolicy> = {
  fast: {
    defaultQuestionBudget: 1,
    phaseQuestionBudget: {
      mvp_scoping: 2,
      risks_assumptions: 1,
    },
    guidance:
      "Quick Pass: ask at most one sharp question per phase, then recommend the clearest decision from available signal. Prefer momentum over exhaustive detail.",
    exitCriteria: [
      "One concrete decision for the active phase",
      "A short rationale",
      "One plausible rejected alternative",
    ],
  },
  deep: {
    defaultQuestionBudget: 2,
    phaseQuestionBudget: {
      mvp_scoping: 3,
      risks_assumptions: 2,
      product_loops: 2,
    },
    guidance:
      "Standard Discovery: gather enough signal to make a reasoned decision, but do not keep probing once the phase budget is reached.",
    exitCriteria: [
      "A concrete decision for the active phase",
      "Rationale grounded in the founder's stated constraints",
      "A real runner-up alternative",
      "Implications for the Product Story",
    ],
  },
  handoff: {
    defaultQuestionBudget: 3,
    phaseQuestionBudget: {
      solution_direction: 4,
      mvp_scoping: 4,
      product_loops: 4,
      risks_assumptions: 4,
    },
    guidance:
      "Deep Planning: collect exhaustive detail, especially CUJs, edge cases, product loops, risks, and success measures.",
    exitCriteria: [
      "A concrete decision for the active phase",
      "Rationale and tradeoffs",
      "A real runner-up alternative",
      "Edge cases or constraints when relevant",
    ],
  },
};

function questionCountForPhase(
  messages: ConversationMessage[],
  phaseKey: PhaseKey,
): number {
  return messages.filter(
    (m) => m.payload.kind === "question" && m.payload.data.phaseKey === phaseKey,
  ).length;
}

export function buildDepthPolicyContext(args: {
  planningDepth: PlanningDepth;
  currentPhaseKey: PhaseKey;
  messages: ConversationMessage[];
}): OrchestratorTurnInput["depthPolicy"] {
  const policy = DEPTH_POLICIES[args.planningDepth];
  const budget =
    policy.phaseQuestionBudget[args.currentPhaseKey] ??
    policy.defaultQuestionBudget;
  const count = questionCountForPhase(args.messages, args.currentPhaseKey);

  return {
    phaseQuestionCount: count,
    phaseQuestionBudget: budget,
    atOrOverBudget: count >= budget,
    guidance: policy.guidance,
    exitCriteria: policy.exitCriteria,
  };
}
