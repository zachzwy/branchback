"use client";

import { useEffect, useMemo, useCallback, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  ReactFlow,
  Background,
  Controls,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type {
  DecisionEdge as DomainEdge,
  DecisionNode,
  GeneratedBrief,
  Project,
} from "@/lib/db/types";
import { classifyDecisions } from "@/lib/graph/lineage";
import { GraphNode, type GraphNodeData, type GraphNodeKind } from "./graph-node";
import { GRAPH_NODE_DIMENSIONS, layoutDagre } from "./layout";
import { DecisionInspector } from "@/components/trail/decision-inspector";
import { BriefInspector } from "./brief-inspector";

interface Props {
  project: Project;
  decisions: DecisionNode[]; // every decision in the project (all active)
  edges: DomainEdge[];
  // Briefs ordered ascending (v1 first). Synthetic "Brief vN" nodes are
  // anchored to each brief's triggeredByDecisionId.
  briefs: GeneratedBrief[];
}

const nodeTypes = { decision: GraphNode };

// Edge styling per relationship.
function styleEdge(rel: DomainEdge["relationship"]): {
  animated: boolean;
  style: React.CSSProperties;
  type?: string;
} {
  switch (rel) {
    case "follows":
      return {
        animated: false,
        style: { stroke: "var(--muted-foreground, #94a3b8)", strokeWidth: 1.5 },
      };
    case "informs":
    case "depends_on":
    default:
      return {
        animated: false,
        style: { stroke: "var(--border, #e2e8f0)", strokeWidth: 1 },
      };
  }
}

function decisionKind(d: DecisionNode): GraphNodeKind {
  return d.madeBy === "user_direct" ? "you_decided" : "agent_rec";
}

function normalizeAlternativeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

export function DecisionGraph({
  project,
  decisions,
  edges,
  briefs,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("d");

  const classification = useMemo(
    () =>
      classifyDecisions({
        decisions,
        edges,
        cursorId: project.currentDecisionId,
      }),
    [decisions, edges, project.currentDecisionId],
  );

  // Build react-flow nodes and edges.
  const { rfNodes, rfEdges } = useMemo(() => {
    const nodes: Node[] = [];
    const builtEdges: Edge[] = [];
    const rootAlternativeAnchors = new Map<string, string>();

    for (const d of decisions) {
      const cls = classification.get(d.id) ?? "off_path";
      const data: GraphNodeData = {
        decision: d,
        rejectedAlt: null,
        brief: null,
        kind: decisionKind(d),
        classification: cls,
        isCursor: project.currentDecisionId === d.id,
        isSelected: selectedId === d.id,
      };
      nodes.push({
        id: d.id,
        type: "decision",
        data: data as unknown as Record<string, unknown>,
        position: { x: 0, y: 0 },
      });
    }

    // Synthesize one ghost node per recorded alternative. Non-root
    // alternatives hang off the same parent that points to the decision, so
    // they render as siblings. Root alternatives have no lineage parent; keep
    // them unconnected and align them below the root after Dagre lays out the
    // real graph.
    const rejectedAltKeys = new Set<string>();
    for (const d of decisions) {
      const parentEdge = edges.find(
        (e) =>
          e.toNodeId === d.id &&
          e.relationship === "follows",
      );
      const parentId = parentEdge?.fromNodeId ?? null;
      d.alternatives.forEach((alt, i) => {
        const normalizedTitle = normalizeAlternativeTitle(alt.title);
        if (!normalizedTitle) return;
        const rejectedAltKey = `${parentId ?? d.id}:${normalizedTitle}`;
        if (rejectedAltKeys.has(rejectedAltKey)) return;
        rejectedAltKeys.add(rejectedAltKey);

        const ghostId = `ghost:${d.id}:${i}`;
        const data: GraphNodeData = {
          decision: null,
          rejectedAlt: { title: alt.title },
          brief: null,
          kind: "rejected_alt",
          classification: "rejected_alt",
          isCursor: false,
          isSelected: false,
        };
        nodes.push({
          id: ghostId,
          type: "decision",
          data: data as unknown as Record<string, unknown>,
          position: { x: 0, y: 0 },
          selectable: false,
        });
        if (parentId) {
          builtEdges.push({
            id: `e:${ghostId}`,
            source: parentId,
            target: ghostId,
            ...styleEdge("informs"),
            style: {
              stroke: "var(--border, #e2e8f0)",
              strokeWidth: 1,
              strokeDasharray: "3 3",
            },
          });
        } else {
          rootAlternativeAnchors.set(ghostId, d.id);
        }
      });
    }

    // Synthetic Brief vN nodes — one per persisted brief, anchored to the
    // decision the brief was generated from. Briefs without an anchor (legacy
    // rows where triggeredByDecisionId is null) are skipped from the canvas.
    const decisionIds = new Set(decisions.map((d) => d.id));
    const lastBriefIdx = briefs.length - 1;
    briefs.forEach((b, idx) => {
      if (!b.triggeredByDecisionId) return;
      if (!decisionIds.has(b.triggeredByDecisionId)) return;
      const briefNodeId = `brief:${b.id}`;
      const data: GraphNodeData = {
        decision: null,
        rejectedAlt: null,
        brief: {
          briefId: b.id,
          version: idx + 1,
          isLatest: idx === lastBriefIdx,
          capturedAt: b.createdAt,
        },
        kind: "brief",
        classification: null,
        isCursor: false,
        isSelected: selectedId === briefNodeId,
      };
      nodes.push({
        id: briefNodeId,
        type: "decision",
        data: data as unknown as Record<string, unknown>,
        position: { x: 0, y: 0 },
      });
      builtEdges.push({
        id: `e:${briefNodeId}`,
        source: b.triggeredByDecisionId,
        target: briefNodeId,
        animated: false,
        style: {
          stroke: "rgb(16 185 129)", // emerald-500
          strokeWidth: 1.25,
          strokeDasharray: "3 3",
        },
      });
    });

    // Real edges from the domain.
    for (const e of edges) {
      builtEdges.push({
        id: e.id,
        source: e.fromNodeId,
        target: e.toNodeId,
        ...styleEdge(e.relationship),
      });
    }

    const laid = layoutDagre(nodes, builtEdges);
    if (rootAlternativeAnchors.size) {
      const offsetY = GRAPH_NODE_DIMENSIONS.height + 28;
      const anchorCounts = new Map<string, number>();
      const positionedById = new Map(laid.nodes.map((n) => [n.id, n]));
      laid.nodes = laid.nodes.map((node) => {
        const anchorId = rootAlternativeAnchors.get(node.id);
        if (!anchorId) return node;
        const anchor = positionedById.get(anchorId);
        if (!anchor) return node;
        const nextIndex = anchorCounts.get(anchorId) ?? 0;
        anchorCounts.set(anchorId, nextIndex + 1);
        return {
          ...node,
          position: {
            x: anchor.position.x,
            y: anchor.position.y + offsetY * (nextIndex + 1),
          },
        };
      });
    }
    return { rfNodes: laid.nodes, rfEdges: laid.edges };
  }, [decisions, edges, classification, project.currentDecisionId, selectedId, briefs]);

  const onNodeClick = useCallback<NodeMouseHandler>(
    (_, node) => {
      if (node.id.startsWith("ghost:")) return;
      const next = new URLSearchParams(searchParams.toString());
      next.set("d", node.id);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  // Pan + zoom to the selected node whenever ?d= changes (e.g. arriving via
  // a deep-link from the brief page or clicking another node). Stored in
  // state so onInit's set call schedules a re-render — using a ref means the
  // effect would run once before onInit fires and then never re-run, so
  // first-paint deep-links would highlight but not zoom.
  const [flow, setFlow] = useState<ReactFlowInstance | null>(null);
  useEffect(() => {
    if (!flow || !selectedId) return;
    if (selectedId.startsWith("ghost:")) return;
    if (!rfNodes.some((n) => n.id === selectedId)) return;
    flow.fitView({
      nodes: [{ id: selectedId }],
      padding: 0.4,
      duration: 600,
      maxZoom: 1.4,
    });
  }, [flow, selectedId, rfNodes]);

  const selectedDecision = useMemo(
    () => decisions.find((d) => d.id === selectedId) ?? null,
    [decisions, selectedId],
  );

  const selectedBrief = useMemo(() => {
    if (!selectedId?.startsWith("brief:")) return null;
    const briefId = selectedId.slice("brief:".length);
    const idx = briefs.findIndex((b) => b.id === briefId);
    if (idx < 0) return null;
    return { brief: briefs[idx], version: idx + 1, isLatest: idx === briefs.length - 1 };
  }, [briefs, selectedId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <section className="relative flex h-1/2 min-h-0 flex-col bg-muted/10 lg:h-full">
        <Legend />
        <div className="min-h-0 flex-1">
          <ReactFlow
            nodes={rfNodes as Node[]}
            edges={rfEdges as Edge[]}
            nodeTypes={nodeTypes}
            onNodeClick={onNodeClick}
            onInit={setFlow}
            fitView
            fitViewOptions={{ padding: 0.18 }}
            minZoom={0.3}
            maxZoom={1.4}
            proOptions={{ hideAttribution: true }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
          >
            <Background gap={24} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      </section>
      <aside className="flex h-1/2 min-h-0 flex-col border-t border-border/60 bg-background lg:h-full lg:border-t-0 lg:border-l">
        {selectedBrief ? (
          <BriefInspector
            projectId={project.id}
            brief={selectedBrief.brief}
            version={selectedBrief.version}
            isLatest={selectedBrief.isLatest}
            triggerDecision={
              selectedBrief.brief.triggeredByDecisionId
                ? (decisions.find(
                    (d) => d.id === selectedBrief.brief.triggeredByDecisionId,
                  ) ?? null)
                : null
            }
          />
        ) : (
          <DecisionInspector
            projectId={project.id}
            decision={selectedDecision}
            allDecisions={decisions}
            edges={edges}
            cursorId={project.currentDecisionId}
            classification={
              selectedDecision
                ? (classification.get(selectedDecision.id) ?? null)
                : null
            }
          />
        )}
      </aside>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border/60 bg-background/80 px-4 py-2 text-[10px] text-muted-foreground">
      <LegendChip color="bg-blue-500" label="You decided" />
      <LegendChip color="bg-amber-500" label="Agent recommended" />
      <LegendChip
        color="bg-muted-foreground/40"
        label="Rejected alt."
        ringStyle="border-dashed"
      />
      <LegendChip color="bg-emerald-500" label="Final brief" />
      <span className="h-3 w-px bg-border/60" aria-hidden />
      <HighlightChip
        label="Cursor"
        ringClass="ring-2 ring-foreground ring-offset-2 ring-offset-background"
      />
      <HighlightChip
        label="Selected"
        ringClass="ring-2 ring-blue-500 shadow-[0_0_0_3px_rgba(59,130,246,0.18)]"
      />
      <span className="ml-auto text-muted-foreground/70">
        Dimmed nodes are on a different branch — click to inspect or revisit.
      </span>
    </div>
  );
}

function LegendChip({
  color,
  label,
  ringStyle,
}: {
  color: string;
  label: string;
  ringStyle?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`inline-block size-2.5 rounded-sm border ${ringStyle ?? "border-border/60"} ${color}`}
      />
      {label}
    </span>
  );
}

function HighlightChip({
  label,
  ringClass,
}: {
  label: string;
  ringClass: string;
}) {
  // Mini node-shaped swatch with the same ring/glow modifiers we apply to a
  // real graph node, so the chip reads as "this is what that state looks
  // like" without us hand-rolling separate styles per chip.
  return (
    <span className="inline-flex items-center gap-2 pl-1">
      <span
        className={`inline-block h-3 w-5 rounded-sm border border-border/60 bg-background ${ringClass}`}
      />
      {label}
    </span>
  );
}

