import { cn } from "@/lib/utils";
import type { ProductStoryPayload } from "@/lib/db/types";

const FIELDS: {
  key: keyof Omit<ProductStoryPayload, "openQuestion">;
  label: string;
  placeholder: string;
}[] = [
  { key: "whoItsFor", label: "Who it's for", placeholder: "Deciding…" },
  { key: "problem", label: "The problem", placeholder: "Deciding…" },
  {
    key: "successLooksLike",
    label: "What success looks like",
    placeholder: "Deciding…",
  },
  { key: "solution", label: "The solution", placeholder: "Deciding…" },
  { key: "mvpFocus", label: "MVP CUJ list", placeholder: "Deciding…" },
];

interface Props {
  payload: ProductStoryPayload | null;
  decisionsCount: number;
}

export function ProductStoryPanel({
  payload,
  decisionsCount,
}: Props) {
  return (
    <aside className="flex h-1/2 w-full shrink-0 flex-col gap-5 border-t border-border/60 px-6 py-6 lg:h-full lg:w-80 lg:border-t-0 lg:border-l">
      <div className="overflow-y-auto scrollbar-none">
        <div className="mb-5">
          <div className="text-sm font-semibold tracking-tight">
            Your product story
          </div>
          <div className="text-xs text-muted-foreground">
            {decisionsCount === 0
              ? "Forming as we talk…"
              : `${decisionsCount} ${decisionsCount === 1 ? "decision" : "decisions"} captured`}
          </div>
        </div>
        <div className="flex flex-col gap-4">
          {FIELDS.map((f) => {
            const value = payload?.[f.key] ?? null;
            return (
              <div key={f.key} className="flex flex-col gap-1">
                <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {f.label}
                </div>
                <div
                  className={cn(
                    "text-[15.6px] leading-snug",
                    value ? "text-foreground" : "italic text-muted-foreground/70",
                  )}
                >
                  {value ?? f.placeholder}
                </div>
              </div>
            );
          })}
        </div>
        {payload?.openQuestion && (
          <div className="mt-5 rounded-md border border-amber-200/60 bg-amber-50 p-3 text-xs leading-snug dark:border-amber-900/50 dark:bg-amber-950/40">
            <div className="text-[12px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
              Open question
            </div>
            <div className="mt-1 text-foreground">
              {payload.openQuestion.text}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
