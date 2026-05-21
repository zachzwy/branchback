"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toastResponseError } from "@/lib/client-errors";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { RecommendationPayload } from "@/lib/db/types";
import { ThinkingBubble } from "./thinking-bubble";

interface Props {
  projectId: string;
  messageId: string;
  payload: RecommendationPayload;
  alreadyConfirmed: boolean;
}

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
  const [askingOpen, setAskingOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [clarifyPending, setClarifyPending] = useState(false);
  const pendingRef = useRef<HTMLDivElement>(null);
  const questionRef = useRef<HTMLTextAreaElement>(null);
  const disabled = alreadyConfirmed || pending || chosen !== null;

  useEffect(() => {
    if (!pending && !clarifyPending) return;
    pendingRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [pending, clarifyPending]);

  useEffect(() => {
    if (askingOpen) questionRef.current?.focus();
  }, [askingOpen]);

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

  const submitQuestion = async () => {
    const text = question.trim();
    if (!text || clarifyPending) return;
    setClarifyPending(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/clarify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, question: text }),
      });
      if (!res.ok) {
        await toastResponseError(res, "Could not ask");
        return;
      }
      setQuestion("");
      setAskingOpen(false);
      router.refresh();
    } finally {
      setClarifyPending(false);
    }
  };

  const onQuestionKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submitQuestion();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setAskingOpen(false);
      setQuestion("");
    }
  };

  const goRecommended = () => confirm(payload.recommended.id);
  const chooseAlternative = () => confirm(payload.alternative.id);

  return (
    <div className="flex max-w-[90%] flex-col gap-3 self-start">
      <div className="text-[16.8px] leading-relaxed">{payload.prompt}</div>
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
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled || askingOpen}
          onClick={() => setAskingOpen(true)}
          className="rounded-full text-muted-foreground"
        >
          I&apos;m not sure yet
        </Button>
      </div>
      {askingOpen && !disabled && (
        <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-muted/40 p-3">
          <div className="text-[14.4px] text-muted-foreground">
            Ask anything about these options — comparison, tradeoffs, edge
            cases. You can still pick one above afterward.
          </div>
          <Textarea
            ref={questionRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={onQuestionKeyDown}
            placeholder="e.g. How do these two compare on time-to-launch?"
            rows={2}
            className="min-h-[60px] resize-none bg-background"
            disabled={clarifyPending}
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setAskingOpen(false);
                setQuestion("");
              }}
              disabled={clarifyPending}
              className="rounded-full"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => void submitQuestion()}
              disabled={!question.trim() || clarifyPending}
              className="rounded-full"
            >
              {clarifyPending ? "Asking…" : "Ask"}
            </Button>
          </div>
        </div>
      )}
      {(pending || clarifyPending) && (
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
        <div className="text-[12px] font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">
          ✶ Recommended
        </div>
      )}
      <div className="text-[16.8px] font-semibold leading-tight">
        {option.title}
      </div>
      <div className="text-[15.6px] leading-snug text-muted-foreground">
        {option.rationale}
      </div>
    </div>
  );
}
