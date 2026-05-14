import Link from "next/link";
import { cn } from "@/lib/utils";
import type { DecisionNode, GeneratedBrief } from "@/lib/db/types";

interface Props {
  projectId: string;
  briefs: GeneratedBrief[]; // ordered ascending — first is v1
  selectedBriefId: string;
  decisionsById: Map<string, DecisionNode>;
}

export function BriefVersionList({
  projectId,
  briefs,
  selectedBriefId,
  decisionsById,
}: Props) {
  // Newest-first display order; version numbers come from the underlying
  // ascending order (v1 is the oldest).
  const indexed = briefs.map((b, i) => ({ brief: b, version: i + 1 }));
  const ordered = [...indexed].reverse();

  return (
    <aside className="flex w-full flex-col gap-2 border-r border-border/60 bg-background px-4 py-5 lg:w-72">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Brief versions
      </div>
      <div className="flex flex-col gap-1.5">
        {ordered.map(({ brief, version }) => {
          const isSelected = brief.id === selectedBriefId;
          const trigger = brief.triggeredByDecisionId
            ? decisionsById.get(brief.triggeredByDecisionId)
            : null;
          const captured = new Date(brief.createdAt).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          });
          return (
            <Link
              key={brief.id}
              href={`/p/${projectId}/brief?v=${brief.id}`}
              scroll={false}
              className={cn(
                "flex flex-col gap-1 rounded-md border border-border/60 bg-background px-3 py-2 text-left transition hover:border-foreground/40",
                isSelected && "border-foreground bg-foreground/[0.04] shadow-sm",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-semibold tracking-tight">
                  Brief v{version}
                </span>
                {version === briefs.length && (
                  <span className="rounded-full bg-foreground/10 px-1.5 py-px text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                    latest
                  </span>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground">
                {captured}
              </span>
              <span
                className={cn(
                  "truncate text-[11px]",
                  trigger ? "text-foreground/80" : "text-muted-foreground/70",
                )}
                title={trigger?.title ?? "No anchor decision"}
              >
                {trigger ? `↳ ${trigger.title}` : "No anchor decision"}
              </span>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
