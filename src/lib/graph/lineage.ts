import {
  PHASE_KEYS,
  type DecisionEdge,
  type DecisionNode,
  type PhaseKey,
  type PhaseStatus,
  type PlanningPhase,
} from "@/lib/db/types";

// Edges that count as "this node is downstream of that node on a branch."
// Walking these backward from the cursor reconstructs the active branch.
const LINEAGE_EDGE_RELATIONSHIPS = new Set<DecisionEdge["relationship"]>([
  "follows",
]);

export type NodeClassification = "on_path" | "off_path" | "rejected_alt";

export interface ClassifiedNode {
  decision: DecisionNode;
  classification: NodeClassification;
}

interface EdgeIndex {
  // toNodeId → list of edges that point AT it (i.e. its incoming edges).
  byTarget: Map<string, DecisionEdge[]>;
  // fromNodeId → list of edges leaving it.
  bySource: Map<string, DecisionEdge[]>;
}

function indexEdges(edges: DecisionEdge[]): EdgeIndex {
  const byTarget = new Map<string, DecisionEdge[]>();
  const bySource = new Map<string, DecisionEdge[]>();
  for (const e of edges) {
    const tgt = byTarget.get(e.toNodeId) ?? [];
    tgt.push(e);
    byTarget.set(e.toNodeId, tgt);
    const src = bySource.get(e.fromNodeId) ?? [];
    src.push(e);
    bySource.set(e.fromNodeId, src);
  }
  return { byTarget, bySource };
}

// Returns the set of decision ids reachable backward from `cursorId` via
// `follows` edges. Each node has at most one `follows` parent, so the walk
// produces a single linear path back to a root.
export function computePathToRoot(
  cursorId: string,
  edges: DecisionEdge[],
): Set<string> {
  if (!cursorId) return new Set();
  const { byTarget } = indexEdges(edges);
  const onPath = new Set<string>();
  const stack = [cursorId];
  while (stack.length) {
    const id = stack.pop();
    if (!id || onPath.has(id)) continue;
    onPath.add(id);
    const incoming = byTarget.get(id) ?? [];
    for (const e of incoming) {
      if (!LINEAGE_EDGE_RELATIONSHIPS.has(e.relationship)) continue;
      stack.push(e.fromNodeId);
    }
  }
  return onPath;
}

export interface ClassifyArgs {
  decisions: DecisionNode[];
  edges: DecisionEdge[];
  cursorId: string | null;
}

// Classify every node relative to the cursor's branch:
// - "on_path": reachable from cursor via `follows` edges.
// - "off_path": exists on a different branch — visible in the graph,
//   inspectable, and revisitable to start yet another branch from there.
export function classifyDecisions({
  decisions,
  edges,
  cursorId,
}: ClassifyArgs): Map<string, NodeClassification> {
  const onPath = cursorId ? computePathToRoot(cursorId, edges) : new Set<string>();
  const out = new Map<string, NodeClassification>();
  for (const d of decisions) {
    out.set(d.id, onPath.has(d.id) ? "on_path" : "off_path");
  }
  return out;
}

// Lineage-only filter for the brief synthesizer / product story panel:
// active decisions reachable from the cursor. If no cursor exists yet (fresh
// project) fall back to "every decision" so a brief is still possible.
export function lineageActiveDecisions(args: ClassifyArgs): DecisionNode[] {
  if (!args.cursorId) return args.decisions.slice();
  const onPath = computePathToRoot(args.cursorId, args.edges);
  if (onPath.size === 0) return args.decisions.slice();
  return args.decisions.filter((d) => onPath.has(d.id));
}

// Recompute phase statuses from the cursor's lineage. A phase is "complete"
// if any on-path decision falls in it; the first non-complete phase becomes
// "active"; the rest are "pending." `idea_intake` has no decision but is
// always seeded complete (the raw idea capture isn't a Decision). We honor
// that by leaving any pre-existing complete idea_intake alone and never
// downgrading it.
export function recomputePhaseStatuses(args: {
  phases: PlanningPhase[];
  decisions: DecisionNode[];
  edges: DecisionEdge[];
  cursorId: string | null;
}): PlanningPhase[] {
  const onPathIds = args.cursorId
    ? computePathToRoot(args.cursorId, args.edges)
    : new Set<string>();
  const phasesWithDecisions = new Set<PhaseKey>();
  if (onPathIds.size > 0) {
    for (const d of args.decisions) {
      if (onPathIds.has(d.id)) {
        phasesWithDecisions.add(d.phaseKey);
      }
    }
  }

  // Build a status for every phase key in canonical order.
  const statusByKey = new Map<PhaseKey, PhaseStatus>();
  let activeAssigned = false;
  for (const key of PHASE_KEYS) {
    if (key === "idea_intake") {
      statusByKey.set(key, "complete");
      continue;
    }
    if (phasesWithDecisions.has(key)) {
      statusByKey.set(key, "complete");
      continue;
    }
    if (!activeAssigned && key !== "final_brief") {
      statusByKey.set(key, "active");
      activeAssigned = true;
      continue;
    }
    statusByKey.set(key, "pending");
  }
  // Edge case: every non-final phase complete → activate final_brief.
  if (!activeAssigned && statusByKey.get("final_brief") === "pending") {
    statusByKey.set("final_brief", "active");
  }

  return args.phases.map((p) => ({
    ...p,
    status: statusByKey.get(p.key) ?? p.status,
  }));
}

// Find off-path subtrees that are eligible to be re-attached onto the active
// branch. A subtree root X is eligible iff:
//   - X is off-path,
//   - X's `follows` parent P is also off-path,
//   - P's `follows` parent G is on-path,
//   - G has another `follows` child Y that is on-path (the sibling branch).
// The natural copy target is Y. Returns one entry per eligible X, with the
// matching target parent.
export function findReattachableSubtrees(args: {
  decisions: DecisionNode[];
  edges: DecisionEdge[];
  cursorId: string | null;
}): Map<string, string> {
  if (!args.cursorId) return new Map();
  const onPath = computePathToRoot(args.cursorId, args.edges);
  if (onPath.size === 0) return new Map();

  const followsByTarget = new Map<string, string>(); // child → parent
  const followsBySource = new Map<string, string[]>(); // parent → children
  for (const e of args.edges) {
    if (e.relationship !== "follows") continue;
    followsByTarget.set(e.toNodeId, e.fromNodeId);
    const list = followsBySource.get(e.fromNodeId) ?? [];
    list.push(e.toNodeId);
    followsBySource.set(e.fromNodeId, list);
  }

  const out = new Map<string, string>();
  for (const d of args.decisions) {
    if (onPath.has(d.id)) continue;
    const parentId = followsByTarget.get(d.id);
    if (!parentId || onPath.has(parentId)) continue;
    const grandparentId = followsByTarget.get(parentId);
    if (!grandparentId || !onPath.has(grandparentId)) continue;
    const siblings = followsBySource.get(grandparentId) ?? [];
    const onPathSibling = siblings.find(
      (id) => id !== parentId && onPath.has(id),
    );
    if (!onPathSibling) continue;
    out.set(d.id, onPathSibling);
  }
  return out;
}

// Walk the subtree rooted at `rootId` via `follows` edges. Returns the node
// ids in topological order (root first, leaves last) and the follows edges
// that connect them.
export function collectFollowsSubtree(
  rootId: string,
  edges: DecisionEdge[],
): { nodeIds: string[]; edges: DecisionEdge[] } {
  const childrenOf = new Map<string, DecisionEdge[]>();
  for (const e of edges) {
    if (e.relationship !== "follows") continue;
    const list = childrenOf.get(e.fromNodeId) ?? [];
    list.push(e);
    childrenOf.set(e.fromNodeId, list);
  }
  const nodeIds: string[] = [];
  const subEdges: DecisionEdge[] = [];
  const seen = new Set<string>();
  const stack: string[] = [rootId];
  while (stack.length) {
    const id = stack.shift();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    nodeIds.push(id);
    const outgoing = childrenOf.get(id) ?? [];
    for (const e of outgoing) {
      subEdges.push(e);
      stack.push(e.toNodeId);
    }
  }
  return { nodeIds, edges: subEdges };
}
