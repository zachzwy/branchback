"use client";

import { useActionState, useState } from "react";
import { ArrowUp, Box, Search, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  createProjectAction,
  type CreateProjectFormState,
} from "@/app/actions";

const DEPTHS = [
  {
    id: "fast",
    label: "Quick Pass",
    duration: "15m",
    description: "Focus on core decisions and high-level momentum.",
    icon: Zap,
  },
  {
    id: "deep",
    label: "Standard Discovery",
    duration: "30m",
    description: "Balanced exploration with reasoned trade-offs.",
    icon: Search,
  },
  {
    id: "handoff",
    label: "Deep Planning",
    duration: "45m",
    description: "Exhaustive deep dive into edge cases and product loops.",
    icon: Box,
  },
] as const;

const initialState: CreateProjectFormState = {};

export function IntakeForm() {
  const [state, formAction, pending] = useActionState(
    createProjectAction,
    initialState,
  );
  const [depth, setDepth] = useState<(typeof DEPTHS)[number]["id"]>("deep");
  const [text, setText] = useState("");

  return (
    <form action={formAction} className="flex flex-col gap-8">
      <input type="hidden" name="planningDepth" value={depth} />
      <div className="rounded-2xl border border-border/60 bg-background shadow-sm">
        <Textarea
          name="rawIdea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='"An app that helps people actually finish the online courses they buy…"'
          rows={4}
          className="min-h-[140px] resize-none border-0 bg-transparent px-6 pt-5 text-[18px] leading-relaxed shadow-none focus-visible:ring-0"
        />
        <div className="flex items-center justify-between border-t border-border/60 px-6 py-3">
          <div className="text-xs text-muted-foreground">
            Be as rough as you like. We&apos;ll sharpen it together.
          </div>
          <Button
            type="submit"
            size="icon"
            disabled={!text.trim() || pending}
            className="rounded-full"
          >
            <ArrowUp className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
          How deep do you want to go?
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {DEPTHS.map((d) => {
            const Icon = d.icon;
            const selected = depth === d.id;
            return (
              <button
                type="button"
                key={d.id}
                onClick={() => setDepth(d.id)}
                className={cn(
                  "flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition",
                  selected
                    ? "border-blue-300 bg-blue-50/60 dark:border-blue-900/60 dark:bg-blue-950/30"
                    : "border-border/60 bg-background hover:bg-muted/40",
                )}
              >
                <Icon
                  className={cn(
                    "size-4",
                    selected ? "text-blue-700 dark:text-blue-300" : "text-foreground",
                  )}
                />
                <div className="flex flex-col">
                  <div
                    className={cn(
                      "text-[16.8px] font-semibold leading-tight",
                      selected && "text-blue-900 dark:text-blue-200",
                    )}
                  >
                    {d.label}
                  </div>
                  <div className="text-[13.2px] text-muted-foreground">
                    {d.duration}
                  </div>
                </div>
                <div className="text-[14.4px] leading-snug text-muted-foreground">
                  {d.description}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {state.error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          {state.error}
        </div>
      )}

      <Button
        type="submit"
        size="lg"
        disabled={!text.trim() || pending}
        className="rounded-full"
      >
        {pending ? "Starting…" : "Start the conversation →"}
      </Button>
    </form>
  );
}
