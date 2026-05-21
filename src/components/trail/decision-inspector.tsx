import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { DecisionEdge, DecisionNode } from "@/lib/db/types";
import type { NodeClassification } from "@/lib/graph/lineage";
import { findReattachableSubtrees } from "@/lib/graph/lineage";
import { PHASE_TITLES } from "@/lib/db/types";
import { cn } from "@/lib/utils";
import { InspectorActions } from "./inspector-actions";

interface Props {
  projectId: string;
  decision: DecisionNode | null;
  // All decisions in the project (every branch). Used to compute re-attach
  // eligibility against the cursor's branch.
  allDecisions: DecisionNode[];
  edges: DecisionEdge[];
  // Optional: when rendered inside the graph view, this drives the
  // Continue-from-here / re-attach affordances on the inspector.
  cursorId?: string | null;
  classification?: NodeClassification | null;
}

const MADE_BY_LABEL: Record<DecisionNode["madeBy"], string> = {
  user_direct: "You decided",
  agent_recommendation_confirmed_by_user: "Agent recommendation, confirmed",
  agent_inferred: "Agent inferred",
};

function confidenceLabel(c: number): string {
  if (c >= 0.75) return "High";
  if (c >= 0.5) return "Medium-high";
  if (c >= 0.3) return "Medium";
  return "Low";
}

export function DecisionInspector({
  projectId,
  decision,
  allDecisions,
  edges,
  cursorId,
  classification,
}: Props) {
  if (!decision) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-8 py-16 text-center">
        <div className="text-sm font-medium text-muted-foreground">
          No decision selected
        </div>
        <div className="max-w-sm text-xs text-muted-foreground/70">
          Pick a decision from the list to see its rationale, alternatives,
          confidence, and revisit options.
        </div>
      </div>
    );
  }

  const reattachableMap = findReattachableSubtrees({
    decisions: allDecisions,
    edges,
    cursorId: cursorId ?? null,
  });
  const reattachTargetId = reattachableMap.get(decision.id) ?? null;

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto px-6 py-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span>{PHASE_TITLES[decision.phaseKey]}</span>
          <Badge
            variant="outline"
            className={cn(
              "rounded-full border-blue-300 text-[12px] text-blue-700 dark:border-blue-900/60 dark:text-blue-300",
              decision.madeBy === "user_direct" &&
                "border-emerald-300 text-emerald-700 dark:border-emerald-900/60 dark:text-emerald-300",
              decision.madeBy === "agent_inferred" &&
                "border-amber-300 text-amber-700 dark:border-amber-900/60 dark:text-amber-300",
            )}
          >
            {MADE_BY_LABEL[decision.madeBy]}
          </Badge>
        </div>
        <h2 className="text-xl font-semibold tracking-tight">
          {decision.title}
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {decision.rationale}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="flex flex-col gap-1 rounded-md border border-border/60 bg-background p-3">
          <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
            Confidence
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-base font-semibold">
              {(decision.confidence * 100).toFixed(0)}%
            </span>
            <span className="text-muted-foreground">
              {confidenceLabel(decision.confidence)}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-1 rounded-md border border-border/60 bg-background p-3">
          <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
            Captured
          </div>
          <div className="text-[14.4px] text-foreground">
            {new Date(decision.createdAt).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </div>
        </div>
      </div>

      {decision.affectedAreas.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
            Affected areas
          </div>
          <div className="flex flex-wrap gap-1.5">
            {decision.affectedAreas.map((a) => (
              <Badge
                key={a}
                variant="secondary"
                className="rounded-full text-[12px]"
              >
                {a}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {decision.alternatives.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
            Alternatives considered
          </div>
          <div className="flex flex-col gap-2 rounded-md border border-dashed border-border/60 bg-muted/30 p-3">
            {decision.alternatives.map((alt) => (
              <div
                key={alt.title}
                className="flex flex-col gap-0.5 text-[14.4px] leading-snug"
              >
                <div className="font-medium">
                  {alt.title}
                  <span className="ml-2 text-[12px] text-muted-foreground">
                    {(alt.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="text-muted-foreground">{alt.rationale}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Separator />

      <InspectorActions
        projectId={projectId}
        decision={decision}
        otherActiveDecisions={allDecisions.filter((d) => d.id !== decision.id)}
        cursorId={cursorId ?? null}
        classification={classification ?? null}
        reattachTargetId={reattachTargetId}
      />
    </div>
  );
}
