import "server-only";

import { randomUUID } from "node:crypto";
import {
  FieldValue,
  type CollectionReference,
  type DocumentReference,
  type Firestore,
  type QuerySnapshot,
  type Transaction,
  type WriteBatch,
} from "firebase-admin/firestore";
import {
  PHASE_KEYS,
  PHASE_TITLES,
  type AIGeneration,
  type ConversationMessage,
  type DecisionEdge,
  type DecisionNode,
  type GeneratedBrief,
  type PlanningPhase,
  type ProductStateSnapshot,
  type Project,
  type RateLimitWindow,
  type WorkspaceSnapshot,
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
import {
  collectFollowsSubtree,
  recomputePhaseStatuses,
} from "@/lib/graph/lineage";
import { getDb } from "./client";
import {
  briefConverter,
  decisionConverter,
  edgeConverter,
  generationConverter,
  messageConverter,
  phaseConverter,
  projectConverter,
  snapshotConverter,
  type RootProject,
} from "./converters";

const USERS = "users";
const PROJECTS = "projects";
const RATE_LIMITS = "rateLimits";

interface ProjectRefs {
  project: DocumentReference<Project & { nextTurnIndex: number }>;
  phases: CollectionReference<PlanningPhase>;
  messages: CollectionReference<ConversationMessage>;
  decisions: CollectionReference<DecisionNode>;
  snapshots: CollectionReference<ProductStateSnapshot>;
  generations: CollectionReference<AIGeneration>;
  briefs: CollectionReference<GeneratedBrief>;
  edges: CollectionReference<DecisionEdge>;
}

function refs(db: Firestore, userId: string, projectId: string): ProjectRefs {
  const project = db
    .collection(USERS)
    .doc(userId)
    .collection(PROJECTS)
    .doc(projectId)
    .withConverter(projectConverter);
  return {
    project,
    phases: project.collection("phases").withConverter(phaseConverter),
    messages: project.collection("messages").withConverter(messageConverter),
    decisions: project.collection("decisions").withConverter(decisionConverter),
    snapshots: project.collection("snapshots").withConverter(snapshotConverter),
    generations: project
      .collection("generations")
      .withConverter(generationConverter),
    briefs: project.collection("briefs").withConverter(briefConverter),
    edges: project.collection("edges").withConverter(edgeConverter),
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function nameFromIdea(rawIdea: string): string {
  const trimmed = rawIdea.trim().split(/\n+/)[0]?.slice(0, 80) ?? "Untitled";
  return trimmed.length ? trimmed : "Untitled project";
}

async function loadOwnedProject(
  db: Firestore,
  uid: string,
  projectId: string,
): Promise<(Project & { nextTurnIndex: number }) | null> {
  const snap = await refs(db, uid, projectId).project.get();
  if (!snap.exists) return null;
  const data = snap.data();
  if (!data || data.userId !== uid) return null;
  return data;
}

// Add a doc with a client-generated UUID so we can echo the id back to the
// caller without a second round-trip. Kept WriteBatch-only on purpose —
// Transaction.set / WriteBatch.set don't unify under a union, and inside
// transactions we call tx.set directly.
function addWithId<T extends { id: string }>(
  batch: WriteBatch,
  collection: CollectionReference<T>,
  value: T,
): void {
  const docRef = collection.doc(value.id);
  batch.set(docRef, value);
}

// Recompute phase statuses against the post-mutation graph and write back any
// phase whose status changed. Caller must already have read `phasesSnap`
// inside the same transaction (Firestore requires reads before writes).
function recomputeAndWritePhases(
  tx: Transaction,
  phasesSnap: QuerySnapshot<PlanningPhase>,
  args: {
    decisions: DecisionNode[];
    edges: DecisionEdge[];
    cursorId: string | null;
  },
): PlanningPhase[] {
  const phaseRefs = phasesSnap.docs.map((d) => ({
    ref: d.ref,
    data: d.data(),
  }));
  const updatedPhases = recomputePhaseStatuses({
    phases: phaseRefs.map((p) => p.data),
    decisions: args.decisions,
    edges: args.edges,
    cursorId: args.cursorId,
  });
  for (let i = 0; i < phaseRefs.length; i++) {
    const desired = updatedPhases[i];
    if (phaseRefs[i].data.status !== desired.status) {
      tx.update(phaseRefs[i].ref, { status: desired.status });
    }
  }
  return updatedPhases;
}

export class FirestoreRepository implements Repository {
  private get db(): Firestore {
    return getDb();
  }

  async createProjectWithSeed(
    input: CreateProjectInput,
  ): Promise<CreateProjectResult> {
    const db = this.db;
    const projectId = randomUUID();
    const initialMessageId = randomUUID();
    const initialSnapshotId = randomUUID();
    const now = nowIso();
    const r = refs(db, input.userId, projectId);
    const batch = db.batch();

    const project: Project & { nextTurnIndex: number } = {
      id: projectId,
      userId: input.userId,
      name: nameFromIdea(input.rawIdea),
      rawIdea: input.rawIdea,
      planningDepth: input.planningDepth,
      currentDecisionId: null,
      createdAt: now,
      updatedAt: now,
      nextTurnIndex: 1, // raw_idea takes turnIndex 0
    };
    batch.set(r.project, project);

    PHASE_KEYS.forEach((key, i) => {
      const phase: PlanningPhase = {
        id: randomUUID(),
        projectId,
        ordinal: i + 1,
        key,
        title: PHASE_TITLES[key],
        status: i === 0 ? "complete" : i === 1 ? "active" : "pending",
      };
      addWithId(batch, r.phases, phase);
    });

    const initialMessage: ConversationMessage = {
      id: initialMessageId,
      projectId,
      role: "user",
      kind: "raw_idea",
      payload: { kind: "raw_idea", data: { text: input.rawIdea } },
      turnIndex: 0,
      createdAt: now,
    };
    addWithId(batch, r.messages, initialMessage);

    const initialSnapshot: ProductStateSnapshot = {
      id: initialSnapshotId,
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
    addWithId(batch, r.snapshots, initialSnapshot);

    await batch.commit();

    return { projectId, initialMessageId, initialSnapshotId };
  }

  async getProjectWorkspace(args: {
    userId: string;
    projectId: string;
  }): Promise<WorkspaceSnapshot | null> {
    const db = this.db;
    const r = refs(db, args.userId, args.projectId);
    const projectSnap = await r.project.get();
    if (!projectSnap.exists) return null;
    const project = projectSnap.data();
    if (!project || project.userId !== args.userId) return null;

    const [phasesQ, messagesQ, snapshotsQ, decisionsQ, edgesQ] =
      await Promise.all([
        r.phases.orderBy("ordinal").get(),
        r.messages.orderBy("turnIndex").get(),
        r.snapshots.orderBy("createdAt", "desc").limit(1).get(),
        r.decisions.get(),
        r.edges.get(),
      ]);

    const projectOut: Project = {
      id: project.id,
      userId: project.userId,
      name: project.name,
      rawIdea: project.rawIdea,
      planningDepth: project.planningDepth,
      currentDecisionId: project.currentDecisionId ?? null,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };

    const decisions = decisionsQ.docs
      .map((d) => d.data())
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    return {
      project: projectOut,
      phases: phasesQ.docs.map((d) => d.data()),
      messages: messagesQ.docs.map((d) => d.data()),
      latestSnapshot: snapshotsQ.empty ? null : snapshotsQ.docs[0].data(),
      decisions,
      edges: edgesQ.docs.map((d) => d.data()),
    };
  }

  async listProjects(args: { userId: string }): Promise<Project[]> {
    const db = this.db;
    const snap = await db
      .collection(USERS)
      .doc(args.userId)
      .collection(PROJECTS)
      .withConverter(projectConverter)
      .get();

    return snap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: data.id,
          userId: data.userId,
          name: data.name,
          rawIdea: data.rawIdea,
          planningDepth: data.planningDepth,
          currentDecisionId: data.currentDecisionId ?? null,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        };
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async deleteUserData(args: { userId: string }): Promise<void> {
    const db = this.db;
    const userRef = db.collection(USERS).doc(args.userId);
    await db.recursiveDelete(userRef);
  }

  async appendMessage(input: AppendMessageInput): Promise<ConversationMessage> {
    const db = this.db;
    const r = refs(db, input.userId, input.projectId);
    const messageId = randomUUID();
    const messageRef = r.messages.doc(messageId);

    const created: ConversationMessage = await db.runTransaction(async (tx) => {
      const projSnap = await tx.get(r.project);
      if (!projSnap.exists) throw new Error("project_not_found");
      const proj = projSnap.data();
      if (!proj || proj.userId !== input.userId) {
        throw new Error("project_forbidden");
      }
      const turnIndex = proj.nextTurnIndex ?? 0;
      const createdAt = nowIso();
      const message: ConversationMessage = {
        id: messageId,
        projectId: input.projectId,
        role: input.role,
        kind: input.payload.kind,
        payload: input.payload,
        turnIndex,
        createdAt,
      };
      tx.set(messageRef, message);
      tx.update(r.project, {
        nextTurnIndex: FieldValue.increment(1),
        updatedAt: createdAt,
      });
      return message;
    });

    return created;
  }

  async insertDecisionNode(
    input: InsertDecisionNodeInput,
  ): Promise<DecisionNode> {
    const db = this.db;
    const r = refs(db, input.userId, input.projectId);

    return db.runTransaction(async (tx) => {
      // All reads must happen before any writes in a Firestore transaction.
      const projSnap = await tx.get(r.project);
      if (!projSnap.exists) throw new Error("project_not_found");
      const proj = projSnap.data();
      if (!proj || proj.userId !== input.userId) {
        throw new Error("project_forbidden");
      }
      const [phasesSnap, decisionsSnap, edgesSnap] = await Promise.all([
        tx.get(r.phases.orderBy("ordinal")),
        tx.get(r.decisions),
        tx.get(r.edges),
      ]);

      const createdAt = nowIso();
      const node: DecisionNode = {
        id: randomUUID(),
        projectId: input.projectId,
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
        createdAt,
      };

      // Lineage edge: link new node to the cursor (its parent on the active
      // path). On the very first decision in a project the cursor is null,
      // so no edge is written.
      const newEdges: DecisionEdge[] = [];
      if (proj.currentDecisionId) {
        newEdges.push({
          id: randomUUID(),
          projectId: input.projectId,
          fromNodeId: proj.currentDecisionId,
          toNodeId: node.id,
          relationship: "follows",
          rationale: "Lineage parent",
          createdAt,
        });
      }

      // Writes.
      tx.set(r.decisions.doc(node.id), node);
      for (const e of newEdges) tx.set(r.edges.doc(e.id), e);
      recomputeAndWritePhases(tx, phasesSnap, {
        decisions: [...decisionsSnap.docs.map((d) => d.data()), node],
        edges: [...edgesSnap.docs.map((d) => d.data()), ...newEdges],
        cursorId: node.id,
      });
      tx.update(r.project, {
        currentDecisionId: node.id,
        updatedAt: createdAt,
      });
      return node;
    });
  }

  async insertProductStateSnapshot(
    input: InsertSnapshotInput,
  ): Promise<ProductStateSnapshot> {
    const db = this.db;
    const project = await loadOwnedProject(db, input.userId, input.projectId);
    if (!project) throw new Error("project_not_found");
    const r = refs(db, input.userId, input.projectId);
    const snap: ProductStateSnapshot = {
      id: randomUUID(),
      projectId: input.projectId,
      payload: input.payload,
      triggeredByDecisionId: input.triggeredByDecisionId,
      createdAt: nowIso(),
    };
    await r.snapshots.doc(snap.id).set(snap);
    return snap;
  }

  async insertAIGeneration(
    input: InsertAIGenerationInput,
  ): Promise<AIGeneration> {
    const db = this.db;
    const project = await loadOwnedProject(db, input.userId, input.projectId);
    if (!project) throw new Error("project_not_found");
    const r = refs(db, input.userId, input.projectId);
    const gen: AIGeneration = {
      id: randomUUID(),
      projectId: input.projectId,
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
    await r.generations.doc(gen.id).set(gen);
    return gen;
  }

  async getReasoningTrail(args: {
    userId: string;
    projectId: string;
  }): Promise<DecisionNode[]> {
    const db = this.db;
    const project = await loadOwnedProject(db, args.userId, args.projectId);
    if (!project) return [];
    const r = refs(db, args.userId, args.projectId);
    const snap = await r.decisions.get();
    return snap.docs
      .map((d) => d.data())
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async getDecisionNode(args: {
    userId: string;
    projectId: string;
    decisionId: string;
  }): Promise<DecisionNode | null> {
    const db = this.db;
    const project = await loadOwnedProject(db, args.userId, args.projectId);
    if (!project) return null;
    const r = refs(db, args.userId, args.projectId);
    const snap = await r.decisions.doc(args.decisionId).get();
    return snap.exists ? (snap.data() ?? null) : null;
  }

  async updateRecommendationConfirmation(args: {
    userId: string;
    projectId: string;
    messageId: string;
    confirmedChoiceId: string;
  }): Promise<ConversationMessage> {
    const db = this.db;
    const r = refs(db, args.userId, args.projectId);
    const messageRef = r.messages.doc(args.messageId);

    return db.runTransaction(async (tx) => {
      const [projSnap, msgSnap] = await Promise.all([
        tx.get(r.project),
        tx.get(messageRef),
      ]);
      if (!projSnap.exists) throw new Error("project_not_found");
      const proj = projSnap.data();
      if (!proj || proj.userId !== args.userId) {
        throw new Error("project_forbidden");
      }
      if (!msgSnap.exists) throw new Error("message_not_found");
      const msg = msgSnap.data();
      if (!msg) throw new Error("message_not_found");
      if (msg.payload.kind !== "recommendation") {
        throw new Error("message_not_recommendation");
      }
      const updatedPayload = {
        kind: "recommendation" as const,
        data: {
          ...msg.payload.data,
          confirmedChoiceId: args.confirmedChoiceId,
        },
      };
      tx.update(messageRef, { payload: updatedPayload });
      return { ...msg, payload: updatedPayload };
    });
  }

  async insertGeneratedBrief(
    input: InsertGeneratedBriefInput,
  ): Promise<GeneratedBrief> {
    const db = this.db;
    const project = await loadOwnedProject(db, input.userId, input.projectId);
    if (!project) throw new Error("project_not_found");
    const r = refs(db, input.userId, input.projectId);
    const briefId = randomUUID();
    const sections = input.sections.map((s) => ({
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
      projectId: input.projectId,
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
    await r.briefs.doc(briefId).set(brief);
    return brief;
  }

  async getLatestBrief(args: {
    userId: string;
    projectId: string;
  }): Promise<GeneratedBrief | null> {
    const db = this.db;
    const project = await loadOwnedProject(db, args.userId, args.projectId);
    if (!project) return null;
    const r = refs(db, args.userId, args.projectId);
    const snap = await r.briefs.orderBy("createdAt", "desc").limit(1).get();
    return snap.empty ? null : (snap.docs[0].data() ?? null);
  }

  async listBriefs(args: {
    userId: string;
    projectId: string;
  }): Promise<GeneratedBrief[]> {
    const db = this.db;
    const project = await loadOwnedProject(db, args.userId, args.projectId);
    if (!project) return [];
    const r = refs(db, args.userId, args.projectId);
    const snap = await r.briefs.orderBy("createdAt", "asc").get();
    return snap.docs.map((d) => d.data());
  }

  async pivotDecision(
    input: PivotDecisionInput,
  ): Promise<PivotDecisionResult> {
    const db = this.db;
    const r = refs(db, input.userId, input.projectId);
    const originalRef = r.decisions.doc(input.originalDecisionId);

    return db.runTransaction(async (tx) => {
      const [projSnap, originalSnap, phasesSnap, decisionsSnap, edgesSnap] =
        await Promise.all([
          tx.get(r.project),
          tx.get(originalRef),
          tx.get(r.phases.orderBy("ordinal")),
          tx.get(r.decisions),
          tx.get(r.edges),
        ]);
      if (!projSnap.exists) throw new Error("project_not_found");
      const proj = projSnap.data();
      if (!proj || proj.userId !== input.userId) {
        throw new Error("project_forbidden");
      }
      if (!originalSnap.exists) throw new Error("decision_not_found");
      const original = originalSnap.data();
      if (!original) throw new Error("decision_not_found");

      const pivotedAt = nowIso();
      const replacement: DecisionNode = {
        id: randomUUID(),
        projectId: input.projectId,
        phaseKey: original.phaseKey,
        nodeType: input.replacement.nodeType ?? original.nodeType,
        title: input.replacement.title,
        rationale: input.replacement.rationale,
        confidence: input.replacement.confidence,
        madeBy: "user_direct",
        alternatives: [
          {
            title: original.title,
            rationale: original.rationale,
            confidence: original.confidence,
          },
          ...original.alternatives.filter(
            (a) =>
              a.title.trim().toLowerCase() !==
              input.replacement.title.trim().toLowerCase(),
          ),
        ],
        affectedAreas: original.affectedAreas,
        sourceMessageId: original.sourceMessageId,
        aiGenerationId: input.aiGenerationId,
        status: "active",
        createdAt: pivotedAt,
      };

      // Lineage edge: parent-of-original → replacement, so the replacement is
      // a sibling of the original on the same branching point. The original
      // and its descendants stay on their branch, untouched.
      const allEdgesPre = edgesSnap.docs.map((d) => d.data());
      const newEdges: DecisionEdge[] = [];
      let lineageEdge: DecisionEdge | null = null;
      const parentEdge = allEdgesPre.find(
        (e) =>
          e.toNodeId === original.id &&
          e.relationship === "follows",
      );
      if (parentEdge) {
        lineageEdge = {
          id: randomUUID(),
          projectId: input.projectId,
          fromNodeId: parentEdge.fromNodeId,
          toNodeId: replacement.id,
          relationship: "follows",
          rationale: input.reason ?? "User pivoted to a new branch.",
          createdAt: pivotedAt,
        };
        newEdges.push(lineageEdge);
      }

      tx.set(r.decisions.doc(replacement.id), replacement);
      for (const e of newEdges) tx.set(r.edges.doc(e.id), e);
      recomputeAndWritePhases(tx, phasesSnap, {
        decisions: [...decisionsSnap.docs.map((d) => d.data()), replacement],
        edges: [...allEdgesPre, ...newEdges],
        cursorId: replacement.id,
      });
      tx.update(r.project, {
        currentDecisionId: replacement.id,
        updatedAt: pivotedAt,
      });

      return {
        originalDecision: original,
        replacementDecision: replacement,
        lineageEdge,
      };
    });
  }

  async getDecisionEdges(args: {
    userId: string;
    projectId: string;
  }): Promise<DecisionEdge[]> {
    const db = this.db;
    const project = await loadOwnedProject(db, args.userId, args.projectId);
    if (!project) return [];
    const r = refs(db, args.userId, args.projectId);
    const snap = await r.edges.get();
    return snap.docs.map((d) => d.data());
  }

  async copySubtreeOntoBranch(
    input: CopySubtreeInput,
  ): Promise<CopySubtreeResult> {
    const db = this.db;
    const r = refs(db, input.userId, input.projectId);

    return db.runTransaction(async (tx) => {
      const [projSnap, decisionsSnap, edgesSnap, phasesSnap] = await Promise.all([
        tx.get(r.project),
        tx.get(r.decisions),
        tx.get(r.edges),
        tx.get(r.phases.orderBy("ordinal")),
      ]);
      if (!projSnap.exists) throw new Error("project_not_found");
      const proj = projSnap.data();
      if (!proj || proj.userId !== input.userId) {
        throw new Error("project_forbidden");
      }

      const allDecisions = decisionsSnap.docs.map((d) => d.data());
      const allEdges = edgesSnap.docs.map((d) => d.data());
      const root = allDecisions.find((d) => d.id === input.subtreeRootId);
      if (!root) throw new Error("subtree_root_not_found");
      const target = allDecisions.find((d) => d.id === input.targetParentId);
      if (!target) throw new Error("target_parent_not_found");

      const { nodeIds, edges: subEdges } = collectFollowsSubtree(
        input.subtreeRootId,
        allEdges,
      );
      const decisionsById = new Map(allDecisions.map((d) => [d.id, d]));
      const idMap = new Map<string, string>();
      for (const id of nodeIds) idMap.set(id, randomUUID());

      const copiedAt = nowIso();
      const copies: DecisionNode[] = nodeIds.map((id) => {
        const src = decisionsById.get(id);
        if (!src) throw new Error("subtree_node_missing");
        return {
          id: idMap.get(id)!,
          projectId: input.projectId,
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

      const newEdges: DecisionEdge[] = [];
      for (const e of subEdges) {
        const from = idMap.get(e.fromNodeId);
        const to = idMap.get(e.toNodeId);
        if (!from || !to) continue;
        newEdges.push({
          id: randomUUID(),
          projectId: input.projectId,
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
        projectId: input.projectId,
        fromNodeId: input.targetParentId,
        toNodeId: copiedRootId,
        relationship: "follows",
        rationale: "Copied from another branch via re-attach.",
        createdAt: copiedAt,
      });

      // Find the deepest leaf of the copied subtree to land the cursor on.
      const childCount = new Map<string, number>();
      for (const e of newEdges) {
        if (e.fromNodeId === input.targetParentId) continue;
        childCount.set(e.fromNodeId, (childCount.get(e.fromNodeId) ?? 0) + 1);
      }
      let leaf = copiedRootId;
      for (const id of nodeIds.map((n) => idMap.get(n)!)) {
        if (!childCount.has(id)) leaf = id;
      }

      for (const c of copies) tx.set(r.decisions.doc(c.id), c);
      for (const e of newEdges) tx.set(r.edges.doc(e.id), e);
      recomputeAndWritePhases(tx, phasesSnap, {
        decisions: [...allDecisions, ...copies],
        edges: [...allEdges, ...newEdges],
        cursorId: leaf,
      });
      tx.update(r.project, {
        currentDecisionId: leaf,
        updatedAt: copiedAt,
      });

      return {
        copiedRootId,
        cursorDecisionId: leaf,
        copiedDecisionIds: copies.map((c) => c.id),
      };
    });
  }

  async setCursor(input: SetCursorInput): Promise<SetCursorResult> {
    const db = this.db;
    const r = refs(db, input.userId, input.projectId);
    const targetRef = r.decisions.doc(input.decisionId);

    return db.runTransaction(async (tx) => {
      const [projSnap, targetSnap, edgesSnap, phasesSnap, decisionsSnap] =
        await Promise.all([
          tx.get(r.project),
          tx.get(targetRef),
          tx.get(r.edges),
          tx.get(r.phases.orderBy("ordinal")),
          tx.get(r.decisions),
        ]);
      if (!projSnap.exists) throw new Error("project_not_found");
      const proj = projSnap.data();
      if (!proj || proj.userId !== input.userId) {
        throw new Error("project_forbidden");
      }
      const target = targetSnap.data();
      if (!target) throw new Error("decision_not_found");

      const updatedAt = nowIso();
      tx.update(r.project, {
        currentDecisionId: target.id,
        updatedAt,
      });
      const updatedPhases = recomputeAndWritePhases(tx, phasesSnap, {
        decisions: decisionsSnap.docs.map((d) => d.data()),
        edges: edgesSnap.docs.map((d) => d.data()),
        cursorId: target.id,
      });

      const updatedProject: Project = {
        id: proj.id,
        userId: proj.userId,
        name: proj.name,
        rawIdea: proj.rawIdea,
        planningDepth: proj.planningDepth,
        currentDecisionId: target.id,
        createdAt: proj.createdAt,
        updatedAt,
      };
      return { project: updatedProject, phases: updatedPhases };
    });
  }

  async consumeLLMQuota(input: {
    userId: string;
    limit: number;
    windowMs: number;
  }): Promise<{ allowed: boolean; remaining: number; resetAt: string }> {
    const db = getDb();
    const ref = db.collection(RATE_LIMITS).doc(input.userId);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const now = Date.now();
      const existing = snap.exists
        ? (snap.data() as RateLimitWindow | undefined)
        : undefined;
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
        tx.set(ref, fresh);
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

      const nextCount = existing.count + 1;
      tx.update(ref, {
        count: nextCount,
        updatedAt: new Date(now).toISOString(),
      });
      return {
        allowed: true,
        remaining: Math.max(0, input.limit - nextCount),
        resetAt: existing.windowResetAt,
      };
    });
  }
}

// Re-export so converters that the repository module silently relies on stay
// reachable in one place — keeps the surface predictable.
export { type RootProject };
