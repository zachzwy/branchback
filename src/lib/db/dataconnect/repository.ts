import "server-only";

import type {
  AIGeneration,
  ConversationMessage,
  DecisionEdge,
  DecisionNode,
  GeneratedBrief,
  WorkspaceSnapshot,
} from "@/lib/db/types";
import type {
  AppendMessageInput,
  CopySubtreeInput,
  CopySubtreeResult,
  CreateProjectInput,
  CreateProjectResult,
  InsertAIGenerationInput,
  InsertDecisionNodeInput,
  InsertGeneratedBriefInput,
  InsertSnapshotInput,
  PivotDecisionInput,
  PivotDecisionResult,
  Repository,
  SetCursorInput,
  SetCursorResult,
} from "@/lib/db/repository";
// import { executeMutation, executeQuery, mutationRef, queryRef } from "firebase/data-connect";
// import { getDc } from "./client";

/**
 * Skeleton implementation of Repository against Firebase Data Connect.
 *
 * STATUS: scaffold only — every method throws until it is wired up against
 * the actual generated client / verified operations.gql.
 *
 * **The shipped backend is Firestore** (see `src/lib/db/firestore/repository.ts`
 * and the Architecture Decision Update at the top of `docs/PLAN.md`). This
 * skeleton remains as the documented Postgres-future migration target —
 * typically triggered by genuine graph-shaped query needs (multi-hop lineage,
 * cross-user analytics) that hurt in a document store. The picker
 * (`src/lib/db/index.ts`) honors `REPOSITORY_MODE=dataconnect` so the typecheck
 * /build stay green while we keep iterating; it is not the active path.
 *
 * To finish wiring, for each method:
 *   1. Verify the matching operation exists in `dataconnect/connector/operations.gql`
 *      and that the variable shape matches the input here.
 *   2. Replace the `notImplemented(...)` body with:
 *
 *        const dc = getDc();
 *        const { data } = await executeMutation(
 *          mutationRef(dc, "OperationName", { ...vars }),
 *        );
 *        return mapToDomain(data);
 *
 *   3. Map the DC response shape (likely a discriminated `*_insert: { id }`
 *      style payload) back to our domain types in `@/lib/db/types`.
 *
 * Server-side auth caveat: Data Connect's JS SDK is browser-oriented. To call
 * it from a Server Component / Route Handler you'll need to either:
 *   - mint a custom token via firebase-admin and exchange it client-style, or
 *   - swap to the gRPC server SDK (currently node-only, undocumented surface),
 *     or
 *   - run mutations through a Cloud Function and have the route POST to that.
 *
 * The slice currently runs against the in-memory store; flip the env var
 * only after working through the steps above.
 */

function notImplemented(method: string): never {
  throw new Error(
    `DataConnectRepository.${method}: not yet wired. ` +
      `Set REPOSITORY_MODE=memory in .env.local for the slice, ` +
      `or follow README § "Wiring Data Connect" to complete the migration.`,
  );
}

export class DataConnectRepository implements Repository {
  async createProjectWithSeed(
    _input: CreateProjectInput,
  ): Promise<CreateProjectResult> {
    // TODO: chain CreateProjectWithSeed + 9x InsertPlanningPhase +
    // AppendConversationMessage(raw_idea) + InsertProductStateSnapshot.
    // Wrap in a single composite mutation once operations.gql supports it.
    notImplemented("createProjectWithSeed");
  }

  async getProjectWorkspace(_args: {
    userId: string;
    projectId: string;
  }): Promise<WorkspaceSnapshot | null> {
    // TODO: executeQuery(queryRef(dc, "GetProjectWorkspace", { projectId }))
    // → reshape into WorkspaceSnapshot. Decision payloads + product-state
    // payloads come back as JSON-stringified columns (per schema.gql), so
    // JSON.parse them on the way out.
    notImplemented("getProjectWorkspace");
  }

  async listProjects(_args: {
    userId: string;
  }): Promise<import("@/lib/db/types").Project[]> {
    notImplemented("listProjects");
  }

  async deleteUserData(_args: { userId: string }): Promise<void> {
    notImplemented("deleteUserData");
  }

  async appendMessage(
    _input: AppendMessageInput,
  ): Promise<ConversationMessage> {
    // TODO: executeMutation(mutationRef(dc, "AppendConversationMessage", ...))
    // turnIndex needs server-side calculation — either select-then-insert in
    // a transaction, or add a `nextTurnIndex(projectId)` server function.
    notImplemented("appendMessage");
  }

  async insertDecisionNode(
    _input: InsertDecisionNodeInput,
  ): Promise<DecisionNode> {
    // TODO: executeMutation(mutationRef(dc, "InsertDecisionNode", {
    //   ...input, alternatives: JSON.stringify(input.alternatives),
    //   affectedAreas: JSON.stringify(input.affectedAreas),
    // })). Phase advancement currently lives in InMemoryRepository — port
    // it to a separate `MarkPhaseComplete` mutation called after.
    notImplemented("insertDecisionNode");
  }

  async insertProductStateSnapshot(
    _input: InsertSnapshotInput,
  ): Promise<import("@/lib/db/types").ProductStateSnapshot> {
    notImplemented("insertProductStateSnapshot");
  }

  async insertAIGeneration(
    _input: InsertAIGenerationInput,
  ): Promise<AIGeneration> {
    notImplemented("insertAIGeneration");
  }

  async getReasoningTrail(_args: {
    userId: string;
    projectId: string;
  }): Promise<DecisionNode[]> {
    notImplemented("getReasoningTrail");
  }

  async getDecisionNode(_args: {
    userId: string;
    projectId: string;
    decisionId: string;
  }): Promise<DecisionNode | null> {
    notImplemented("getDecisionNode");
  }

  async updateRecommendationConfirmation(_args: {
    userId: string;
    projectId: string;
    messageId: string;
    confirmedChoiceId: string;
  }): Promise<ConversationMessage> {
    // TODO: needs an UpdateConversationMessagePayload mutation to merge
    // confirmedChoiceId into the JSON payload column.
    notImplemented("updateRecommendationConfirmation");
  }

  async insertGeneratedBrief(
    _input: InsertGeneratedBriefInput,
  ): Promise<GeneratedBrief> {
    // TODO: insert generated_briefs row + N brief_sections rows. Operations
    // need to be added to operations.gql.
    notImplemented("insertGeneratedBrief");
  }

  async getLatestBrief(_args: {
    userId: string;
    projectId: string;
  }): Promise<GeneratedBrief | null> {
    notImplemented("getLatestBrief");
  }

  async listBriefs(_args: {
    userId: string;
    projectId: string;
  }): Promise<GeneratedBrief[]> {
    notImplemented("listBriefs");
  }

  async pivotDecision(
    _input: PivotDecisionInput,
  ): Promise<PivotDecisionResult> {
    // TODO: composite mutation — InsertDecisionNode(replacement) +
    // InsertDecisionEdge(follows from parent-of-original).
    notImplemented("pivotDecision");
  }

  async getDecisionEdges(_args: {
    userId: string;
    projectId: string;
  }): Promise<DecisionEdge[]> {
    notImplemented("getDecisionEdges");
  }

  async copySubtreeOntoBranch(
    _input: CopySubtreeInput,
  ): Promise<CopySubtreeResult> {
    notImplemented("copySubtreeOntoBranch");
  }

  async setCursor(_input: SetCursorInput): Promise<SetCursorResult> {
    notImplemented("setCursor");
  }

  async consumeLLMQuota(_input: {
    userId: string;
    limit: number;
    windowMs: number;
  }): Promise<{ allowed: boolean; remaining: number; resetAt: string }> {
    notImplemented("consumeLLMQuota");
  }
}
