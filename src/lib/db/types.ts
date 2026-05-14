export type PlanningDepth = "fast" | "deep" | "handoff";

export const PHASE_KEYS = [
  "idea_intake",
  "problem_clarification",
  "user_narrowing",
  "outcome_definition",
  "solution_direction",
  "mvp_scoping",
  "product_loops",
  "risks_assumptions",
  "final_brief",
] as const;
export type PhaseKey = (typeof PHASE_KEYS)[number];

export const PHASE_TITLES: Record<PhaseKey, string> = {
  idea_intake: "Idea Intake",
  problem_clarification: "Problem Clarification",
  user_narrowing: "User Narrowing",
  outcome_definition: "Outcome Definition",
  solution_direction: "Solution Direction",
  mvp_scoping: "MVP CUJ List",
  product_loops: "Product Loops",
  risks_assumptions: "Risks & Assumptions",
  final_brief: "Final Brief",
};

export type PhaseStatus = "pending" | "active" | "complete";

export interface Project {
  id: string;
  userId: string;
  name: string;
  rawIdea: string;
  planningDepth: PlanningDepth;
  // Cursor: which decision the user is "at." New decisions hang off this node
  // via a `follows` edge. Null when no decisions have been made yet.
  currentDecisionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlanningPhase {
  id: string;
  projectId: string;
  ordinal: number;
  key: PhaseKey;
  title: string;
  status: PhaseStatus;
}

export type ConversationMessageRole = "user" | "assistant" | "system";

export type ConversationMessageKind =
  | "raw_idea"
  | "question"
  | "answer"
  | "recommendation"
  | "acknowledgement"
  | "clarification_question"
  | "clarification_answer";

export interface QuestionPayload {
  text: string;
  phaseKey: PhaseKey;
  options?: { id: string; label: string }[];
}

export interface RecommendationOption {
  id: string;
  title: string;
  rationale: string;
  confidence: number;
}

export interface RecommendationPayload {
  phaseKey: PhaseKey;
  prompt: string;
  recommended: RecommendationOption;
  alternative: RecommendationOption;
  confirmedChoiceId?: string | null;
}

export interface AcknowledgementPayload {
  text: string;
  affects: string[];
  decisionId: string;
}

export interface RawIdeaPayload {
  text: string;
}

export interface AnswerPayload {
  text: string;
}

// Open question the user asks about a pending recommendation when clicking
// "I'm not sure yet" — never expects a structured action back, just prose.
export interface ClarificationQuestionPayload {
  text: string;
  recommendationMessageId: string;
}

export interface ClarificationAnswerPayload {
  text: string;
  recommendationMessageId: string;
}

export type ConversationPayload =
  | { kind: "raw_idea"; data: RawIdeaPayload }
  | { kind: "question"; data: QuestionPayload }
  | { kind: "answer"; data: AnswerPayload }
  | { kind: "recommendation"; data: RecommendationPayload }
  | { kind: "acknowledgement"; data: AcknowledgementPayload }
  | { kind: "clarification_question"; data: ClarificationQuestionPayload }
  | { kind: "clarification_answer"; data: ClarificationAnswerPayload };

export interface ConversationMessage {
  id: string;
  projectId: string;
  role: ConversationMessageRole;
  kind: ConversationMessageKind;
  payload: ConversationPayload;
  turnIndex: number;
  createdAt: string;
}

export type DecisionMadeBy =
  | "user_direct"
  | "agent_recommendation_confirmed_by_user"
  | "agent_inferred";

export interface DecisionNode {
  id: string;
  projectId: string;
  phaseKey: PhaseKey;
  nodeType: string;
  title: string;
  rationale: string;
  confidence: number;
  madeBy: DecisionMadeBy;
  alternatives: { title: string; rationale: string; confidence: number }[];
  affectedAreas: string[];
  sourceMessageId: string | null;
  aiGenerationId: string | null;
  status: "active";
  createdAt: string;
}

export interface ProductStoryPayload {
  whoItsFor: string | null;
  problem: string | null;
  successLooksLike: string | null;
  solution: string | null;
  mvpFocus: string | null;
  openQuestion: { text: string; phaseKey: PhaseKey } | null;
}

export interface ProductStateSnapshot {
  id: string;
  projectId: string;
  payload: ProductStoryPayload;
  triggeredByDecisionId: string | null;
  createdAt: string;
}

export type DecisionEdgeRelationship =
  | "informs"
  | "depends_on"
  // Lineage parent: previous decision in the path that produced this node.
  | "follows";

export interface DecisionEdge {
  id: string;
  projectId: string;
  fromNodeId: string;
  toNodeId: string;
  relationship: DecisionEdgeRelationship;
  rationale: string;
  createdAt: string;
}

export type AIProviderId = "mock" | "ollama" | "openai";

export interface RateLimitWindow {
  userId: string;
  count: number;
  windowStartedAt: string;
  windowResetAt: string;
  updatedAt: string;
}

export interface AIGeneration {
  id: string;
  projectId: string;
  module: string;
  capabilityTier: string;
  routingPolicy: string;
  providerId: AIProviderId;
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
  userVisible: boolean;
  committedToGraph: boolean;
  latencyMs: number;
  createdAt: string;
}

export interface WorkspaceSnapshot {
  project: Project;
  phases: PlanningPhase[];
  messages: ConversationMessage[];
  latestSnapshot: ProductStateSnapshot | null;
  // Every decision in the project. All decisions stay active forever — pivots
  // create siblings rather than superseding. The graph branches; the cursor
  // walk picks which branch is "current."
  decisions: DecisionNode[];
  // All edges across the project. Drives the graph canvas + the cursor-lineage
  // walk used by the brief compiler.
  edges: DecisionEdge[];
}

export const BRIEF_SECTION_KEYS = [
  "who_its_for",
  "the_problem",
  "core_insight",
  "mvp_thesis",
  "excluded_from_mvp",
  "success_metrics",
] as const;
export type BriefSectionKey = (typeof BRIEF_SECTION_KEYS)[number];

export const BRIEF_SECTION_TITLES: Record<BriefSectionKey, string> = {
  who_its_for: "Who it's for",
  the_problem: "The problem",
  core_insight: "Core insight",
  mvp_thesis: "MVP thesis",
  excluded_from_mvp: "Excluded from MVP",
  success_metrics: "Success metrics",
};

export interface BriefSection {
  id: string;
  briefId: string;
  ordinal: number;
  key: BriefSectionKey;
  title: string;
  body: string;
  bullets: string[];
  sourceDecisionIds: string[];
  isPlaceholder: boolean;
}

export interface BriefOpenQuestion {
  text: string;
  phaseKey: PhaseKey;
  phaseTitle: string;
}

export const BRIEF_HANDOFF_KEYS = [
  "design",
  "technical_architecture",
  "implementation",
  "qa",
  "marketing",
  "financial",
  "legal",
  "customer_success",
] as const;
export type BriefHandoffKey = (typeof BRIEF_HANDOFF_KEYS)[number];

export const BRIEF_HANDOFF_TITLES: Record<BriefHandoffKey, string> = {
  design: "Design agent",
  technical_architecture: "Technical architecture agent",
  implementation: "Implementation agent",
  qa: "QA engineer agent",
  marketing: "Marketing agent",
  financial: "Financial agent",
  legal: "Legal agent",
  customer_success: "Customer success agent",
};

export interface BriefHandoffPrompt {
  key: BriefHandoffKey;
  title: string;
  description: string;
  prompt: string;
}

export interface GeneratedBrief {
  id: string;
  projectId: string;
  conceptName: string;
  tagline: string;
  elevatorPitch?: string;
  sections: BriefSection[];
  openQuestions: BriefOpenQuestion[];
  handoffPrompts: BriefHandoffPrompt[];
  sourceDecisionIds: string[];
  triggeredByDecisionId: string | null;
  decisionCount: number;
  phasesCompleted: number;
  phasesTotal: number;
  createdAt: string;
}
