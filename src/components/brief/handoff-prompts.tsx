"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { BriefHandoffPrompt } from "@/lib/db/types";

interface Props {
  prompts: BriefHandoffPrompt[];
}

export function HandoffPromptsSection({ prompts }: Props) {
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());

  if (prompts.length === 0) return null;

  const toggle = (key: string) => {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const copy = async (p: BriefHandoffPrompt) => {
    try {
      await navigator.clipboard.writeText(p.prompt);
      toast.success(`${p.title} prompt copied to clipboard.`);
    } catch {
      toast.error("Could not copy", { description: "Please try again." });
    }
  };

  return (
    <section className="mt-10">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold tracking-tight">
          Handoff prompts for downstream agents
        </h2>
        <span className="text-[11px] text-muted-foreground">
          {prompts.length} prompts · click a card to expand · copy to send
        </span>
      </div>
      <div className="flex flex-col gap-3">
        {prompts.map((p) => {
          const isOpen = openKeys.has(p.key);
          return (
            <article
              key={p.key}
              className="overflow-hidden rounded-xl border border-border/60 bg-background"
            >
              <header className="flex items-start gap-3 px-5 py-4">
                <button
                  type="button"
                  onClick={() => toggle(p.key)}
                  className="flex flex-1 items-start gap-3 text-left"
                  aria-expanded={isOpen}
                >
                  {isOpen ? (
                    <ChevronDown className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="flex flex-col gap-1">
                    <div className="text-sm font-semibold tracking-tight">
                      {p.title}
                    </div>
                    <div className="text-[12px] leading-relaxed text-muted-foreground">
                      {p.description}
                    </div>
                  </div>
                </button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copy(p)}
                  className="shrink-0 rounded-full"
                >
                  <Copy className="size-3.5" />
                  Copy
                </Button>
              </header>
              {isOpen && (
                <pre className="border-t border-border/60 bg-muted/30 px-5 py-4 text-[12px] leading-relaxed text-foreground whitespace-pre-wrap font-mono">
                  {p.prompt}
                </pre>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
