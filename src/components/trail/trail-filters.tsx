"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const FILTERS = [
  { id: "all", label: "All", dot: "bg-muted-foreground/40" },
  { id: "user_direct", label: "You decided", dot: "bg-emerald-500" },
  {
    id: "agent_recommendation_confirmed_by_user",
    label: "Agent rec",
    dot: "bg-blue-500",
  },
  { id: "agent_inferred", label: "Agent inferred", dot: "bg-amber-500" },
] as const;

export function TrailFilters({ active }: { active: string }) {
  const router = useRouter();
  const search = useSearchParams();

  const setFilter = (id: string) => {
    const params = new URLSearchParams(search.toString());
    if (id === "all") params.delete("type");
    else params.set("type", id);
    params.delete("d"); // clear selection when filter changes
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  };

  return (
    <div className="flex flex-wrap gap-1.5 border-b border-border/60 px-4 py-3">
      {FILTERS.map((f) => {
        const selected = active === f.id;
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13.2px] transition",
              selected
                ? "border-foreground bg-foreground text-background"
                : "border-border/60 text-muted-foreground hover:border-foreground/40",
            )}
          >
            <span className={cn("size-1.5 rounded-full", f.dot)} />
            {f.label}
          </button>
        );
      })}
    </div>
  );
}
