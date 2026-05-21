import { cn } from "@/lib/utils";

interface Props {
  /** Optional secondary line shown under the dots (e.g. elapsed seconds). */
  hint?: string;
}

export function ThinkingBubble({ hint }: Props) {
  return (
    <div className="flex flex-col gap-1">
      <div
        className="inline-flex max-w-[80%] items-center gap-1.5 self-start rounded-2xl rounded-bl-sm border border-border/60 bg-background px-4 py-3"
        aria-live="polite"
        aria-label="Assistant is thinking"
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn(
              "size-1.5 rounded-full bg-muted-foreground/60",
              "animate-pulse",
            )}
            style={{
              animationDelay: `${i * 180}ms`,
              animationDuration: "1100ms",
            }}
          />
        ))}
      </div>
      {hint && (
        <span className="self-start pl-2 text-[13.2px] text-muted-foreground/70">
          {hint}
        </span>
      )}
    </div>
  );
}
