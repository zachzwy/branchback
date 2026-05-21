"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import type { DecisionNode } from "@/lib/db/types";
import { PHASE_TITLES } from "@/lib/db/types";
import { cn } from "@/lib/utils";

interface Props {
  decision: DecisionNode;
  isSelected: boolean;
}

const MADE_BY_DOT: Record<DecisionNode["madeBy"], string> = {
  user_direct: "bg-emerald-500",
  agent_recommendation_confirmed_by_user: "bg-blue-500",
  agent_inferred: "bg-amber-500",
};

const MADE_BY_LABEL: Record<DecisionNode["madeBy"], string> = {
  user_direct: "You decided",
  agent_recommendation_confirmed_by_user: "Agent rec · confirmed",
  agent_inferred: "Agent inferred",
};

export function DecisionCard({ decision, isSelected }: Props) {
  const router = useRouter();
  const search = useSearchParams();

  const select = () => {
    const params = new URLSearchParams(search.toString());
    params.set("d", decision.id);
    router.replace(`?${params.toString()}#decision-${decision.id}`, {
      scroll: false,
    });
  };

  return (
    <button
      type="button"
      onClick={select}
      id={`decision-${decision.id}`}
      className={cn(
        "group flex w-full flex-col gap-1.5 rounded-lg border bg-background p-3 text-left transition",
        isSelected
          ? "border-foreground shadow-sm"
          : "border-border/60 hover:border-foreground/40",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "size-2 shrink-0 rounded-full",
            MADE_BY_DOT[decision.madeBy],
          )}
        />
        <span className="truncate text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
          {PHASE_TITLES[decision.phaseKey]}
        </span>
      </div>
      <div className="text-sm font-semibold leading-tight">
        {decision.title}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
        <Badge
          variant="outline"
          className="rounded-full border-border/60 px-1.5 py-0 text-[10.8px]"
        >
          {MADE_BY_LABEL[decision.madeBy]}
        </Badge>
        <span>·</span>
        <span>conf {(decision.confidence * 100).toFixed(0)}%</span>
      </div>
    </button>
  );
}
