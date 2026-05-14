import type {
  AIGeneration,
  BriefHandoffPrompt,
  BriefOpenQuestion,
  BriefSectionKey,
  ConversationMessage,
  ConversationPayload,
  DecisionEdge,
  DecisionEdgeRelationship,
  DecisionNode,
  GeneratedBrief,
  PlanningDepth,
  PlanningPhase,
  Project,
  ProductStateSnapshot,
  ProductStoryPayload,
  WorkspaceSnapshot,
} from "./types";

export interface CreateProjectInput {
  userId: string;
  rawIdea: string;
  planningDepth: PlanningDepth;
}

export interface CreateProjectResult {
  projectId: string;
  initialMessageId: string;
  initialSnapshotId: string;
}

export interface AppendMessageInput {
  userId: string;
  projectId: string;
  role: ConversationMessage["role"];
  payload: ConversationPayload;
}

export interface InsertDecisionNodeInput {
  userId: string;
  projectId: string;
  phaseKey: DecisionNode["phaseKey"];
  nodeType: string;
  title: string;
  rationale: string;
  confidence: number;
  madeBy: DecisionNode["madeBy"];
  alternatives: DecisionNode["alternatives"];
  affectedAreas: string[];
  sourceMessageId: string | null;
  aiGenerationId: string | null;
}

export interface InsertSnapshotInput {
  userId: string;
  projectId: string;
  payload: ProductStoryPayload;
  triggeredByDecisionId: string | null;
}

export interface InsertAIGenerationInput {
  userId: string;
  projectId: string;
  module: string;
  capabilityTier: string;
  routingPolicy: string;
  providerId: AIGeneration["providerId"];
  modelId: string;
  promptVersion: string;
  inputHash: string;
  outputHash: string;
  providerCallStatus: AIGeneration["providerCallStatus"];
  validatorStatus: AIGeneration["validatorStatus"];
  userVisible: boolean;
  committedToGraph: boolean;
  latencyMs: number;
}

export interface Repository {
  createProjectWithSeed(input: CreateProjectInput): Promise<CreateProjectResult>;

  getProjectWorkspace(args: {
    userId: string;
    projectId: string;
  }): Promise<WorkspaceSnapshot | null>;

  listProjects(args: { userId: string }): Promise<Project[]>;

  deleteUserData(args: { userId: string }): Promise<void>;

  appendMessage(input: AppendMessageInput): Promise<ConversationMessage>;

  insertDecisionNode(input: InsertDecisionNodeInput): Promise<DecisionNode>;

  insertProductStateSnapshot(
    input: InsertSnapshotInput,
  ): Promise<ProductStateSnapshot>;

  insertAIGeneration(input: InsertAIGenerationInput): Promise<AIGeneration>;

  getReasoningTrail(args: {
    userId: string;
    projectId: string;
  }): Promise<DecisionNode[]>;

  getDecisionNode(args: {
    userId: string;
    projectId: string;
    decisionId: string;
  }): Promise<DecisionNode | null>;

  updateRecommendationConfirmation(args: {
    userId: string;
    projectId: string;
    messageId: string;
    confirmedChoiceId: string;
  }): Promise<ConversationMessage>;

  insertGeneratedBrief(input: InsertGeneratedBriefInput): Promise<GeneratedBrief>;

  getLatestBrief(args: {
    userId: string;
    projectId: string;
  }): Promise<GeneratedBrief | null>;

  // Returns every persisted brief for a project, ordered by createdAt ascending
  // so v1 is the first one. Powers the version-history panel on /brief.
  listBriefs(args: {
    userId: string;
    projectId: string;
  }): Promise<GeneratedBrief[]>;

  // Pivot: create a sibling decision at the same phase as the original.
  // The original stays untouched on its branch; the cursor moves to the
  // replacement so subsequent turns build out the new branch.
  pivotDecision(input: PivotDecisionInput): Promise<PivotDecisionResult>;

  getDecisionEdges(args: {
    userId: string;
    projectId: string;
  }): Promise<DecisionEdge[]>;

  // Copy an off-path subtree onto the current (cursor's) branch. Walks the
  // subtree rooted at `subtreeRootId` via follows edges, creates a fresh
  // decision per node with new IDs, and parents the root copy under
  // `targetParentId`. Cursor moves to the deepest leaf of the copied subtree.
  copySubtreeOntoBranch(input: CopySubtreeInput): Promise<CopySubtreeResult>;

  // Move the cursor (project.currentDecisionId). Recomputes phase statuses
  // from the new lineage.
  setCursor(input: SetCursorInput): Promise<SetCursorResult>;

  // Atomically read-reset-or-increment a per-user LLM call counter
  // within a rolling window anchored at the user's first call. Returns
  // `allowed: false` without incrementing when the limit is hit.
  consumeLLMQuota(input: {
    userId: string;
    limit: number;
    windowMs: number;
  }): Promise<{ allowed: boolean; remaining: number; resetAt: string }>;
}

export interface CopySubtreeInput {
  userId: string;
  projectId: string;
  subtreeRootId: string;
  targetParentId: string;
}

export interface CopySubtreeResult {
  copiedRootId: string;
  cursorDecisionId: string;
  copiedDecisionIds: string[];
}

export interface SetCursorInput {
  userId: string;
  projectId: string;
  decisionId: string;
}

export interface SetCursorResult {
  project: Project;
  phases: PlanningPhase[];
}

export interface PivotDecisionInput {
  userId: string;
  projectId: string;
  originalDecisionId: string;
  replacement: {
    title: string;
    rationale: string;
    confidence: number;
    nodeType?: string;
  };
  reason: string | null;
  aiGenerationId: string | null;
}

export interface PivotDecisionResult {
  originalDecision: DecisionNode;
  replacementDecision: DecisionNode;
  lineageEdge: DecisionEdge | null;
}

export interface InsertDecisionEdgeInput {
  userId: string;
  projectId: string;
  fromNodeId: string;
  toNodeId: string;
  relationship: DecisionEdgeRelationship;
  rationale: string;
}

export interface InsertBriefSectionInput {
  ordinal: number;
  key: BriefSectionKey;
  title: string;
  body: string;
  bullets: string[];
  sourceDecisionIds: string[];
  isPlaceholder: boolean;
}

export interface InsertGeneratedBriefInput {
  userId: string;
  projectId: string;
  conceptName: string;
  tagline: string;
  elevatorPitch: string;
  sections: InsertBriefSectionInput[];
  openQuestions: BriefOpenQuestion[];
  handoffPrompts: BriefHandoffPrompt[];
  sourceDecisionIds: string[];
  triggeredByDecisionId: string | null;
  decisionCount: number;
  phasesCompleted: number;
  phasesTotal: number;
}
