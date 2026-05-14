"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import type { DecisionNode } from "@/lib/db/types";
import type { NodeClassification } from "@/lib/graph/lineage";
import { PHASE_TITLES } from "@/lib/db/types";
import { GRAPH_NODE_DIMENSIONS } from "./layout";

export type GraphNodeKind =
  | "you_decided"
  | "agent_rec"
  | "rejected_alt"
  | "brief";

export interface GraphNodeBriefMeta {
  briefId: string;
  version: number;
  isLatest: boolean;
  capturedAt: string; // ISO
}

export interface GraphNodeData extends Record<string, unknown> {
  decision: DecisionNode | null; // null when this is a synthesized rejected-alt or brief
  rejectedAlt: { title: string } | null;
  brief: GraphNodeBriefMeta | null;
  kind: GraphNodeKind;
  classification: NodeClassification | null;
  isCursor: boolean;
  isSelected: boolean;
}

const KIND_LABEL: Record<GraphNodeKind, string> = {
  you_decided: "You decided",
  agent_rec: "Agent rec · confirmed",
  rejected_alt: "Rejected",
  brief: "Final brief",
};

// Border accent on top, subtle bg, label color. Off-path active nodes share
// the same kind as on-path; we dim them via opacity rather than a different
// palette so the user can see "this exists on another branch" without
// reading it as "deactivated."
const KIND_STYLES: Record<GraphNodeKind, string> = {
  you_decided:
    "border-blue-300 bg-blue-50/70 dark:border-blue-900/60 dark:bg-blue-950/40",
  agent_rec:
    "border-amber-300 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/40",
  rejected_alt:
    "border-dashed border-border/60 bg-muted/20 text-muted-foreground",
  brief:
    "border-emerald-300 bg-emerald-50/80 dark:border-emerald-900/60 dark:bg-emerald-950/40",
};

const KIND_LABEL_COLOR: Record<GraphNodeKind, string> = {
  you_decided: "text-blue-700 dark:text-blue-300",
  agent_rec: "text-amber-700 dark:text-amber-300",
  rejected_alt: "text-muted-foreground/70",
  brief: "text-emerald-700 dark:text-emerald-300",
};

export function GraphNode({ data, selected }: NodeProps) {
  const d = data as GraphNodeData;
  const isInteractive = d.kind !== "rejected_alt";
  let subtitle: string;
  let title: string;
  if (d.kind === "brief" && d.brief) {
    subtitle = `${d.brief.isLatest ? "Latest · " : ""}${new Date(d.brief.capturedAt).toLocaleDateString()}`;
    title = `Brief v${d.brief.version}`;
  } else {
    subtitle = d.decision ? PHASE_TITLES[d.decision.phaseKey] : "Alternative";
    title = d.decision?.title ?? d.rejectedAlt?.title ?? "—";
  }
  // Selection is driven by the URL (`?d=`) and surfaced through data.isSelected;
  // ReactFlow's own selection state (`selected`) is not used by our flow, so
  // we OR them together to cover both deep-links and any future internal
  // selection events.
  const isHighlighted = d.isSelected || selected;
  const isOffPath = d.classification === "off_path";
  return (
    <div
      style={{ width: GRAPH_NODE_DIMENSIONS.width, height: GRAPH_NODE_DIMENSIONS.height }}
      className={cn(
        "group flex flex-col gap-1 rounded-md border px-3 py-2 text-left transition",
        KIND_STYLES[d.kind],
        isOffPath && "opacity-60",
        d.isCursor && "ring-2 ring-foreground ring-offset-2 ring-offset-background",
        isHighlighted &&
          !d.isCursor &&
          "ring-4 ring-blue-500 shadow-[0_0_0_6px_rgba(59,130,246,0.18)]",
        isInteractive ? "cursor-pointer" : "cursor-default",
      )}
    >
      <div
        className={cn(
          "text-[9px] font-semibold uppercase tracking-wider",
          KIND_LABEL_COLOR[d.kind],
        )}
      >
        {KIND_LABEL[d.kind]}
      </div>
      <div className="truncate text-[12px] font-semibold leading-tight">
        {title}
      </div>
      <div className="truncate text-[10px] text-muted-foreground">
        {subtitle}
      </div>
      <Handle
        type="target"
        position={Position.Left}
        className="!h-1.5 !w-1.5 !border-0 !bg-border"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-1.5 !w-1.5 !border-0 !bg-border"
      />
    </div>
  );
}
