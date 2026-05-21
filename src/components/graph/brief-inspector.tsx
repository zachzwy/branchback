import Link from "next/link";
import { ArrowUpRight, BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import type { DecisionNode, GeneratedBrief } from "@/lib/db/types";
import { cn } from "@/lib/utils";

interface Props {
  projectId: string;
  brief: GeneratedBrief;
  version: number;
  isLatest: boolean;
  triggerDecision: DecisionNode | null;
}

export function BriefInspector({
  projectId,
  brief,
  version,
  isLatest,
  triggerDecision,
}: Props) {
  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto px-6 py-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <BookOpen className="size-3" />
            Final brief
          </span>
          <Badge
            variant="outline"
            className="rounded-full border-emerald-300 text-[12px] text-emerald-700 dark:border-emerald-900/60 dark:text-emerald-300"
          >
            v{version}
            {isLatest ? " · latest" : ""}
          </Badge>
        </div>
        <h2 className="text-xl font-semibold tracking-tight">
          {brief.conceptName}
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {brief.tagline}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="flex flex-col gap-1 rounded-md border border-border/60 bg-background p-3">
          <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
            Decisions
          </div>
          <div className="text-base font-semibold">
            {brief.decisionCount}{" "}
            <span className="text-[13.2px] font-normal text-muted-foreground">
              · {brief.phasesCompleted}/{brief.phasesTotal} phases
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-1 rounded-md border border-border/60 bg-background p-3">
          <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
            Captured
          </div>
          <div className="text-[14.4px] text-foreground">
            {new Date(brief.createdAt).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </div>
        </div>
      </div>

      {triggerDecision && (
        <div className="flex flex-col gap-2">
          <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
            Anchored to
          </div>
          <div className="rounded-md border border-border/60 bg-background p-3 text-[14.4px]">
            <div className="font-medium">{triggerDecision.title}</div>
            <div className="mt-0.5 text-[13.2px] text-muted-foreground">
              Cursor when this brief was generated
            </div>
          </div>
        </div>
      )}

      {brief.openQuestions.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
            Open questions at capture
          </div>
          <ul className="flex flex-col gap-1 text-[14.4px] text-muted-foreground">
            {brief.openQuestions.slice(0, 4).map((q, i) => (
              <li key={`${q.phaseKey}-${i}`} className="flex gap-2">
                <span className="text-muted-foreground/60">•</span>
                <span>
                  <span className="text-foreground">{q.phaseTitle}</span> —{" "}
                  {q.text}
                </span>
              </li>
            ))}
            {brief.openQuestions.length > 4 && (
              <li className="pl-4 text-muted-foreground/70">
                +{brief.openQuestions.length - 4} more
              </li>
            )}
          </ul>
        </div>
      )}

      <Link
        href={`/p/${projectId}/brief?v=${brief.id}`}
        className={cn(
          buttonVariants({ size: "sm", variant: "default" }),
          "rounded-full",
        )}
      >
        Open this brief
        <ArrowUpRight className="size-3.5" />
      </Link>
    </div>
  );
}
