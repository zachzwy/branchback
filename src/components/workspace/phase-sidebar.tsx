import { Circle, CircleCheck, CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlanningPhase } from "@/lib/db/types";

function PhaseIcon({ status }: { status: PlanningPhase["status"] }) {
  if (status === "complete")
    return <CircleCheck className="size-3.5 text-emerald-500" />;
  if (status === "active")
    return <CircleDot className="size-3.5 text-foreground" />;
  return <Circle className="size-3.5 text-muted-foreground/40" />;
}

export function PhaseSidebar({ phases }: { phases: PlanningPhase[] }) {
  return (
    <div className="flex shrink-0 flex-col border-border/60 lg:w-44 lg:border-r">
      {/* Desktop label */}
      <div className="hidden px-4 pt-6 pb-3 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground lg:block">
        Phases
      </div>

      <div className="w-full overflow-x-auto border-b border-border/40 scrollbar-none lg:border-b-0">
        <ol className="flex min-w-max items-center gap-1.5 px-6 py-4 text-[15.6px] lg:min-w-0 lg:flex-col lg:items-stretch lg:gap-1.5 lg:px-4 lg:py-0 lg:pb-6">
          {phases.map((p) => (
            <li
              key={p.id}
              className={cn(
                "flex items-center gap-2 rounded px-2 py-1 leading-tight transition lg:px-1",
                p.status === "active" && "font-medium text-foreground",
                p.status === "complete" && "text-foreground/80",
                p.status === "pending" && "text-muted-foreground/70",
                p.status === "active" && "bg-foreground/5 lg:bg-transparent",
              )}
            >
              <PhaseIcon status={p.status} />
              <span className="truncate whitespace-nowrap lg:whitespace-normal">
                {p.title}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
