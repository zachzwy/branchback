import "server-only";

import { randomUUID } from "node:crypto";
import {
  PHASE_KEYS,
  PHASE_TITLES,
  type AIGeneration,
  type BriefSection,
  type ConversationMessage,
  type DecisionEdge,
  type DecisionNode,
  type GeneratedBrief,
  type PlanningPhase,
  type Project,
  type ProductStateSnapshot,
  type RateLimitWindow,
  type WorkspaceSnapshot,
} from "./types";
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
} from "./repository";
import {
  collectFollowsSubtree,
  recomputePhaseStatuses,
} from "@/lib/graph/lineage";

interface Tables {
  projects: Map<string, Project>;
  phases: Map<string, PlanningPhase[]>;
  messages: Map<string, ConversationMessage[]>;
  decisions: Map<string, DecisionNode[]>;
  snapshots: Map<string, ProductStateSnapshot[]>;
  generations: Map<string, AIGeneration[]>;
  briefs: Map<string, GeneratedBrief[]>;
  edges: Map<string, DecisionEdge[]>;
  rateLimits: Map<string, RateLimitWindow>;
}

declare global {
  // eslint-disable-next-line no-var
  var __branchbackMemoryTables: Tables | undefined;
}

function tables(): Tables {
  if (!globalThis.__branchbackMemoryTables) {
    globalThis.__branchbackMemoryTables = {
      projects: new Map(),
      phases: new Map(),
      messages: new Map(),
      decisions: new Map(),
      snapshots: new Map(),
      generations: new Map(),
      briefs: new Map(),
      edges: new Map(),
      rateLimits: new Map(),
    };
  }
  // HMR / older instances may predate fields added to Tables; lazily backfill.
  if (!globalThis.__branchbackMemoryTables.rateLimits) {
    globalThis.__branchbackMemoryTables.rateLimits = new Map();
  }
  return globalThis.__branchbackMemoryTables;
}

function nowIso(): string {
  return new Date().toISOString();
}

function nameFromIdea(rawIdea: string): string {
  const trimmed = rawIdea.trim().split(/\n+/)[0]?.slice(0, 80) ?? "Untitled";
  return trimmed.length ? trimmed : "Untitled project";
}

function assertOwner(project: Project | undefined, userId: string): Project {
  if (!project) throw new Error("project_not_found");
  if (project.userId !== userId) throw new Error("project_forbidden");
  return project;
}

// Read-side variant. Treats "not yours" the same as "doesn't exist" so route
// handlers can return a uniform 404 without leaking existence.
function ownedOrNull(
  project: Project | undefined,
  userId: string,
): Project | null {
  if (!project) return null;
  if (project.userId !== userId) return null;
  return project;
}

function nextTurnIndex(messages: ConversationMessage[]): number {
  if (!messages.length) return 0;
  return messages[messages.length - 1].turnIndex + 1;
}

export class InMemoryRepository implements Repository {
  async createProjectWithSeed(
    input: CreateProjectInput,
  ): Promise<CreateProjectResult> {
    const t = tables();
    const projectId = randomUUID();
    const now = nowIso();

    const project: Project = {
      id: projectId,
      userId: input.userId,
      name: nameFromIdea(input.rawIdea),
      rawIdea: input.rawIdea,
      planningDepth: input.planningDepth,
      currentDecisionId: null,
      createdAt: now,
      updatedAt: now,
    };
    t.projects.set(projectId, project);

    const phases: PlanningPhase[] = PHASE_KEYS.map((key, i) => ({
      id: randomUUID(),
      projectId,
      ordinal: i + 1,
      key,
      title: PHASE_TITLES[key],
      status: i === 0 ? "complete" : i === 1 ? "active" : "pending",
    }));
    t.phases.set(projectId, phases);

    const initialMessage: ConversationMessage = {
      id: randomUUID(),
      projectId,
      role: "user",
      kind: "raw_idea",
      payload: { kind: "raw_idea", data: { text: input.rawIdea } },
      turnIndex: 0,
      createdAt: now,
    };
    t.messages.set(projectId, [initialMessage]);

    const initialSnapshot: ProductStateSnapshot = {
      id: randomUUID(),
      projectId,
      payload: {
        whoItsFor: null,
        problem: null,
        successLooksLike: null,
        solution: null,
        mvpFocus: null,
        openQuestion: null,
      },
      triggeredByDecisionId: null,
      createdAt: now,
    };
    t.snapshots.set(projectId, [initialSnapshot]);
    t.decisions.set(projectId, []);
    t.generations.set(projectId, []);
    t.briefs.set(projectId, []);
    t.edges.set(projectId, []);

    return {
      projectId,
      initialMessageId: initialMessage.id,
      initialSnapshotId: initialSnapshot.id,
    };
  }

  async getProjectWorkspace(args: {
    userId: string;
    projectId: string;
  }): Promise<WorkspaceSnapshot | null> {
    const t = tables();
    const project = ownedOrNull(t.projects.get(args.projectId), args.userId);
    if (!project) return null;

    const phases = (t.phases.get(args.projectId) ?? []).slice();
    const messages = (t.messages.get(args.projectId) ?? []).slice();
    const snapshots = t.snapshots.get(args.projectId) ?? [];
    const decisions = (t.decisions.get(args.projectId) ?? []).slice();
    const edges = (t.edges.get(args.projectId) ?? []).slice();
    const latestSnapshot =
      snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;

    return {
      project,
      phases,
      messages,
      latestSnapshot,
      decisions,
      edges,
    };
  }

  async listProjects(args: { userId: string }): Promise<Project[]> {
    const t = tables();
    return Array.from(t.projects.values())
      .filter((p) => p.userId === args.userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async deleteUserData(args: { userId: string }): Promise<void> {
    const t = tables();
    const projectIds = Array.from(t.projects.values())
      .filter((p) => p.userId === args.userId)
      .map((p) => p.id);

    for (const projectId of projectIds) {
      t.projects.delete(projectId);
      t.phases.delete(projectId);
      t.messages.delete(projectId);
      t.decisions.delete(projectId);
      t.snapshots.delete(projectId);
      t.generations.delete(projectId);
      t.briefs.delete(projectId);
      t.edges.delete(projectId);
    }
  }

  async appendMessage(input: AppendMessageInput): Promise<ConversationMessage> {
    const t = tables();
    const project = assertOwner(t.projects.get(input.projectId), input.userId);
    const list = t.messages.get(project.id) ?? [];
    const message: ConversationMessage = {
      id: randomUUID(),
      projectId: project.id,
      role: input.role,
      kind: input.payload.kind,
      payload: input.payload,
      turnIndex: nextTurnIndex(list),
      createdAt: nowIso(),
    };
    list.push(message);
    t.messages.set(project.id, list);
    project.updatedAt = message.createdAt;
    return message;
  }

  async insertDecisionNode(
    input: InsertDecisionNodeInput,
  ): Promise<DecisionNode> {
    const t = tables();
    const project = assertOwner(t.projects.get(input.projectId), input.userId);
    const list = t.decisions.get(project.id) ?? [];
    const node: DecisionNode = {
      id: randomUUID(),
      projectId: project.id,
      phaseKey: input.phaseKey,
      nodeType: input.nodeType,
      title: input.title,
      rationale: input.rationale,
      confidence: input.confidence,
      madeBy: input.madeBy,
      alternatives: input.alternatives,
      affectedAreas: input.affectedAreas,
      sourceMessageId: input.sourceMessageId,
      aiGenerationId: input.aiGenerationId,
      status: "active",
      createdAt: nowIso(),
    };
    list.push(node);
    t.decisions.set(project.id, list);

    // Lineage edge: link the new node to the current cursor (its parent on
    // the active path). On the very first decision in a project the cursor
    // is null, so no edge is written.
    const edges = t.edges.get(project.id) ?? [];
    if (project.currentDecisionId) {
      const lineageEdge: DecisionEdge = {
        id: randomUUID(),
        projectId: project.id,
        fromNodeId: project.currentDecisionId,
        toNodeId: node.id,
        relationship: "follows",
        rationale: "Lineage parent",
        createdAt: node.createdAt,
      };
      edges.push(lineageEdge);
      t.edges.set(project.id, edges);
    }

    // Cursor advances to the new node.
    project.currentDecisionId = node.id;
    project.updatedAt = node.createdAt;

    // Recompute phase statuses from the new lineage.
    const phases = recomputePhaseStatuses({
      phases: t.phases.get(project.id) ?? [],
      decisions: list,
      edges,
      cursorId: project.currentDecisionId,
    });
    t.phases.set(project.id, phases);

    return node;
  }

  async insertProductStateSnapshot(
    input: InsertSnapshotInput,
  ): Promise<ProductStateSnapshot> {
    const t = tables();
    const project = assertOwner(t.projects.get(input.projectId), input.userId);
    const list = t.snapshots.get(project.id) ?? [];
    const snap: ProductStateSnapshot = {
      id: randomUUID(),
      projectId: project.id,
      payload: input.payload,
      triggeredByDecisionId: input.triggeredByDecisionId,
      createdAt: nowIso(),
    };
    list.push(snap);
    t.snapshots.set(project.id, list);
    return snap;
  }

  async insertAIGeneration(
    input: InsertAIGenerationInput,
  ): Promise<AIGeneration> {
    const t = tables();
    const project = assertOwner(t.projects.get(input.projectId), input.userId);
    const list = t.generations.get(project.id) ?? [];
    const gen: AIGeneration = {
      id: randomUUID(),
      projectId: project.id,
      module: input.module,
      capabilityTier: input.capabilityTier,
      routingPolicy: input.routingPolicy,
      providerId: input.providerId,
      modelId: input.modelId,
      promptVersion: input.promptVersion,
      inputHash: input.inputHash,
      outputHash: input.outputHash,
      providerCallStatus: input.providerCallStatus,
      validatorStatus: input.validatorStatus,
      userVisible: input.userVisible,
      committedToGraph: input.committedToGraph,
      latencyMs: input.latencyMs,
      createdAt: nowIso(),
    };
    list.push(gen);
    t.generations.set(project.id, list);
    return gen;
  }

  async getReasoningTrail(args: {
    userId: string;
    projectId: string;
  }): Promise<DecisionNode[]> {
    const t = tables();
    const project = ownedOrNull(t.projects.get(args.projectId), args.userId);
    if (!project) return [];
    return (t.decisions.get(args.projectId) ?? []).slice();
  }

  async getDecisionNode(args: {
    userId: string;
    projectId: string;
    decisionId: string;
  }): Promise<DecisionNode | null> {
    const t = tables();
    const project = ownedOrNull(t.projects.get(args.projectId), args.userId);
    if (!project) return null;
    const list = t.decisions.get(args.projectId) ?? [];
    return list.find((d) => d.id === args.decisionId) ?? null;
  }

  async insertGeneratedBrief(
    input: InsertGeneratedBriefInput,
  ): Promise<GeneratedBrief> {
    const t = tables();
    const project = assertOwner(t.projects.get(input.projectId), input.userId);
    const briefs = t.briefs.get(project.id) ?? [];
    const briefId = randomUUID();
    const sections: BriefSection[] = input.sections.map((s) => ({
      id: randomUUID(),
      briefId,
      ordinal: s.ordinal,
      key: s.key,
      title: s.title,
      body: s.body,
      bullets: s.bullets,
      sourceDecisionIds: s.sourceDecisionIds,
      isPlaceholder: s.isPlaceholder,
    }));
    const brief: GeneratedBrief = {
      id: briefId,
      projectId: project.id,
      conceptName: input.conceptName,
      tagline: input.tagline,
      elevatorPitch: input.elevatorPitch,
      sections,
      openQuestions: input.openQuestions,
      handoffPrompts: input.handoffPrompts,
      sourceDecisionIds: input.sourceDecisionIds,
      triggeredByDecisionId: input.triggeredByDecisionId,
      decisionCount: input.decisionCount,
      phasesCompleted: input.phasesCompleted,
      phasesTotal: input.phasesTotal,
      createdAt: nowIso(),
    };
    briefs.push(brief);
    t.briefs.set(project.id, briefs);
    return brief;
  }

  async getLatestBrief(args: {
    userId: string;
    projectId: string;
  }): Promise<GeneratedBrief | null> {
    const t = tables();
    const project = ownedOrNull(t.projects.get(args.projectId), args.userId);
    if (!project) return null;
    const briefs = t.briefs.get(args.projectId) ?? [];
    return briefs.length > 0 ? briefs[briefs.length - 1] : null;
  }

  async listBriefs(args: {
    userId: string;
    projectId: string;
  }): Promise<GeneratedBrief[]> {
    const t = tables();
    const project = ownedOrNull(t.projects.get(args.projectId), args.userId);
    if (!project) return [];
    return (t.briefs.get(args.projectId) ?? []).slice();
  }

  async pivotDecision(
    input: PivotDecisionInput,
  ): Promise<PivotDecisionResult> {
    const t = tables();
    const project = assertOwner(t.projects.get(input.projectId), input.userId);
    const list = t.decisions.get(project.id) ?? [];
    const original = list.find((d) => d.id === input.originalDecisionId);
    if (!original) throw new Error("decision_not_found");

    const pivotedAt = nowIso();
    const replacement: DecisionNode = {
      id: randomUUID(),
      projectId: project.id,
      phaseKey: original.phaseKey,
      nodeType: input.replacement.nodeType ?? original.nodeType,
      title: input.replacement.title,
      rationale: input.replacement.rationale,
      confidence: input.replacement.confidence,
      madeBy: "user_direct",
      // Carry forward the original's alternatives — including the title
      // we just chose against — so the trail keeps the full lineage.
      alternatives: [
        {
          title: original.title,
          rationale: original.rationale,
          confidence: original.confidence,
        },
        ...original.alternatives.filter(
          (a) => a.title.trim().toLowerCase() !==
            input.replacement.title.trim().toLowerCase(),
        ),
      ],
      affectedAreas: original.affectedAreas,
      sourceMessageId: original.sourceMessageId,
      aiGenerationId: input.aiGenerationId,
      status: "active",
      createdAt: pivotedAt,
    };
    list.push(replacement);
    t.decisions.set(project.id, list);

    const edges = t.edges.get(project.id) ?? [];

    // Lineage edge: parent-of-original → replacement, so the replacement is
    // a sibling of the original on the same branching point. The original
    // and its descendants stay on their branch, untouched.
    const parentEdge = edges.find(
      (e) =>
        e.toNodeId === original.id &&
        e.relationship === "follows",
    );
    let lineageEdge: DecisionEdge | null = null;
    if (parentEdge) {
      lineageEdge = {
        id: randomUUID(),
        projectId: project.id,
        fromNodeId: parentEdge.fromNodeId,
        toNodeId: replacement.id,
        relationship: "follows",
        rationale: input.reason ?? "User pivoted to a new branch.",
        createdAt: pivotedAt,
      };
      edges.push(lineageEdge);
      t.edges.set(project.id, edges);
    }

    // Cursor moves to the replacement; the user is now "on" the new branch.
    project.currentDecisionId = replacement.id;
    project.updatedAt = pivotedAt;

    const phases = recomputePhaseStatuses({
      phases: t.phases.get(project.id) ?? [],
      decisions: list,
      edges,
      cursorId: project.currentDecisionId,
    });
    t.phases.set(project.id, phases);

    return {
      originalDecision: original,
      replacementDecision: replacement,
      lineageEdge,
    };
  }

  async getDecisionEdges(args: {
    userId: string;
    projectId: string;
  }): Promise<DecisionEdge[]> {
    const t = tables();
    const project = ownedOrNull(t.projects.get(args.projectId), args.userId);
    if (!project) return [];
    return (t.edges.get(args.projectId) ?? []).slice();
  }

  async copySubtreeOntoBranch(
    input: CopySubtreeInput,
  ): Promise<CopySubtreeResult> {
    const t = tables();
    const project = assertOwner(t.projects.get(input.projectId), input.userId);
    const decisions = t.decisions.get(project.id) ?? [];
    const edges = t.edges.get(project.id) ?? [];

    const root = decisions.find((d) => d.id === input.subtreeRootId);
    if (!root) throw new Error("subtree_root_not_found");
    const target = decisions.find((d) => d.id === input.targetParentId);
    if (!target) throw new Error("target_parent_not_found");

    // Collect the subtree rooted at the source.
    const { nodeIds, edges: subEdges } = collectFollowsSubtree(
      input.subtreeRootId,
      edges,
    );
    const decisionsById = new Map(decisions.map((d) => [d.id, d]));
    const idMap = new Map<string, string>(); // original id → copy id
    for (const id of nodeIds) idMap.set(id, randomUUID());

    const copiedAt = nowIso();
    const copies: DecisionNode[] = nodeIds.map((id) => {
      const src = decisionsById.get(id);
      if (!src) throw new Error("subtree_node_missing");
      return {
        id: idMap.get(id)!,
        projectId: project.id,
        phaseKey: src.phaseKey,
        nodeType: src.nodeType,
        title: src.title,
        rationale: src.rationale,
        confidence: src.confidence,
        madeBy: src.madeBy,
        alternatives: src.alternatives,
        affectedAreas: src.affectedAreas,
        sourceMessageId: src.sourceMessageId,
        aiGenerationId: src.aiGenerationId,
        status: "active",
        createdAt: copiedAt,
      };
    });
    decisions.push(...copies);
    t.decisions.set(project.id, decisions);

    // Edges among the copies. Plus one new follows edge: target → copied root.
    const newEdges: DecisionEdge[] = [];
    for (const e of subEdges) {
      const from = idMap.get(e.fromNodeId);
      const to = idMap.get(e.toNodeId);
      if (!from || !to) continue;
      newEdges.push({
        id: randomUUID(),
        projectId: project.id,
        fromNodeId: from,
        toNodeId: to,
        relationship: "follows",
        rationale: e.rationale,
        createdAt: copiedAt,
      });
    }
    const copiedRootId = idMap.get(input.subtreeRootId)!;
    newEdges.push({
      id: randomUUID(),
      projectId: project.id,
      fromNodeId: input.targetParentId,
      toNodeId: copiedRootId,
      relationship: "follows",
      rationale: "Copied from another branch via re-attach.",
      createdAt: copiedAt,
    });
    edges.push(...newEdges);
    t.edges.set(project.id, edges);

    // Cursor → deepest leaf of the copied subtree, so phase status reflects
    // the brought-over progress.
    const childCount = new Map<string, number>();
    for (const e of newEdges) {
      if (e.fromNodeId === input.targetParentId) continue;
      childCount.set(e.fromNodeId, (childCount.get(e.fromNodeId) ?? 0) + 1);
    }
    let leaf = copiedRootId;
    for (const id of nodeIds.map((n) => idMap.get(n)!)) {
      if (!childCount.has(id)) leaf = id;
    }
    project.currentDecisionId = leaf;
    project.updatedAt = copiedAt;

    const phases = recomputePhaseStatuses({
      phases: t.phases.get(project.id) ?? [],
      decisions,
      edges,
      cursorId: project.currentDecisionId,
    });
    t.phases.set(project.id, phases);

    return {
      copiedRootId,
      cursorDecisionId: leaf,
      copiedDecisionIds: copies.map((c) => c.id),
    };
  }

  async setCursor(input: SetCursorInput): Promise<SetCursorResult> {
    const t = tables();
    const project = assertOwner(t.projects.get(input.projectId), input.userId);
    const decisions = t.decisions.get(project.id) ?? [];
    const target = decisions.find((d) => d.id === input.decisionId);
    if (!target) throw new Error("decision_not_found");

    project.currentDecisionId = target.id;
    project.updatedAt = nowIso();

    const edges = t.edges.get(project.id) ?? [];
    const phases = recomputePhaseStatuses({
      phases: t.phases.get(project.id) ?? [],
      decisions,
      edges,
      cursorId: project.currentDecisionId,
    });
    t.phases.set(project.id, phases);
    return { project: { ...project }, phases };
  }

  async updateRecommendationConfirmation(args: {
    userId: string;
    projectId: string;
    messageId: string;
    confirmedChoiceId: string;
  }): Promise<ConversationMessage> {
    const t = tables();
    const project = assertOwner(t.projects.get(args.projectId), args.userId);
    const list = t.messages.get(project.id) ?? [];
    const idx = list.findIndex((m) => m.id === args.messageId);
    if (idx < 0) throw new Error("message_not_found");
    const msg = list[idx];
    if (msg.payload.kind !== "recommendation") {
      throw new Error("message_not_recommendation");
    }
    const updated: ConversationMessage = {
      ...msg,
      payload: {
        kind: "recommendation",
        data: {
          ...msg.payload.data,
          confirmedChoiceId: args.confirmedChoiceId,
        },
      },
    };
    list[idx] = updated;
    t.messages.set(project.id, list);
    return updated;
  }

  async consumeLLMQuota(input: {
    userId: string;
    limit: number;
    windowMs: number;
  }): Promise<{ allowed: boolean; remaining: number; resetAt: string }> {
    const t = tables();
    const now = Date.now();
    const existing = t.rateLimits.get(input.userId);
    const expired = existing
      ? new Date(existing.windowResetAt).getTime() <= now
      : true;

    if (!existing || expired) {
      const startedAt = new Date(now).toISOString();
      const resetAt = new Date(now + input.windowMs).toISOString();
      const fresh: RateLimitWindow = {
        userId: input.userId,
        count: 1,
        windowStartedAt: startedAt,
        windowResetAt: resetAt,
        updatedAt: startedAt,
      };
      t.rateLimits.set(input.userId, fresh);
      return {
        allowed: true,
        remaining: Math.max(0, input.limit - 1),
        resetAt,
      };
    }

    if (existing.count >= input.limit) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: existing.windowResetAt,
      };
    }

    const updated: RateLimitWindow = {
      ...existing,
      count: existing.count + 1,
      updatedAt: new Date(now).toISOString(),
    };
    t.rateLimits.set(input.userId, updated);
    return {
      allowed: true,
      remaining: Math.max(0, input.limit - updated.count),
      resetAt: updated.windowResetAt,
    };
  }
}
