"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { toastResponseError } from "@/lib/client-errors";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RecommendationPayload } from "@/lib/db/types";
import { ThinkingBubble } from "./thinking-bubble";

interface Props {
  projectId: string;
  messageId: string;
  payload: RecommendationPayload;
  alreadyConfirmed: boolean;
}

const SECONDARY_ACTIONS: { id: string; label: string; comingSoon: string }[] = [
  {
    id: "not_sure",
    label: "I'm not sure yet",
    comingSoon: "Open-question capture ships in the next slice.",
  },
];

export function RecommendationCardSet({
  projectId,
  messageId,
  payload,
  alreadyConfirmed,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [chosen, setChosen] = useState<string | null>(
    payload.confirmedChoiceId ?? null,
  );
  const pendingRef = useRef<HTMLDivElement>(null);
  const disabled = alreadyConfirmed || pending || chosen !== null;

  useEffect(() => {
    if (!pending) return;
    pendingRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [pending]);

  const confirm = (choiceId: string) => {
    setChosen(choiceId);
    startTransition(async () => {
      const res = await fetch(`/api/projects/${projectId}/decisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, choiceId }),
      });
      if (!res.ok) {
        await toastResponseError(res, "Could not capture decision");
        setChosen(null);
        return;
      }
      router.refresh();
    });
  };

  const goRecommended = () => confirm(payload.recommended.id);
  const chooseAlternative = () => confirm(payload.alternative.id);

  return (
    <div className="flex max-w-[90%] flex-col gap-3 self-start">
      <div className="text-[14px] leading-relaxed">{payload.prompt}</div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <OptionCard
          option={payload.recommended}
          recommended
          selected={chosen === payload.recommended.id}
          dimmed={chosen !== null && chosen !== payload.recommended.id}
        />
        <OptionCard
          option={payload.alternative}
          selected={chosen === payload.alternative.id}
          dimmed={chosen !== null && chosen !== payload.alternative.id}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button
          size="sm"
          onClick={goRecommended}
          disabled={disabled}
          className="rounded-full"
        >
          Go with {payload.recommended.title.toLowerCase()}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={chooseAlternative}
          disabled={disabled}
          className="rounded-full"
        >
          Choose {payload.alternative.title.toLowerCase()}
        </Button>
        {SECONDARY_ACTIONS.map((a) => (
          <Button
            key={a.id}
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() => toast(a.comingSoon)}
            className="rounded-full text-muted-foreground"
          >
            {a.label}
          </Button>
        ))}
      </div>
      {pending && (
        <div ref={pendingRef}>
          <ThinkingBubble />
        </div>
      )}
    </div>
  );
}

function OptionCard({
  option,
  recommended = false,
  selected = false,
  dimmed = false,
}: {
  option: { title: string; rationale: string; confidence: number };
  recommended?: boolean;
  selected?: boolean;
  dimmed?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border p-4 transition",
        recommended
          ? "border-blue-300 bg-blue-50/60 dark:border-blue-900/60 dark:bg-blue-950/30"
          : "border-border/60 bg-background",
        selected && "ring-2 ring-foreground",
        dimmed && "opacity-50",
      )}
    >
      {recommended && (
        <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">
          ✶ Recommended
        </div>
      )}
      <div className="text-[14px] font-semibold leading-tight">
        {option.title}
      </div>
      <div className="text-[13px] leading-snug text-muted-foreground">
        {option.rationale}
      </div>
    </div>
  );
}
