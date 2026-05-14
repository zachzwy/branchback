"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp } from "lucide-react";
import { toastResponseError, toastThrownError } from "@/lib/client-errors";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ConversationMessage } from "@/lib/db/types";
import { ConversationMessageItem } from "./conversation-message";
import { UserBubble } from "./message-bubbles";
import { ThinkingBubble } from "./thinking-bubble";

interface Props {
  projectId: string;
  messages: ConversationMessage[];
  isComplete: boolean;
  latestBriefId?: string | null;
}

export function ConversationPanel({
  projectId,
  messages,
  isComplete,
  latestBriefId,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [autoTriggerPending, setAutoTriggerPending] = useState(false);
  const [draft, setDraft] = useState("");
  const [optimisticAnswer, setOptimisticAnswer] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const isThinking = pending || autoTriggerPending;

  // Drive an elapsed-seconds counter so users on slow LLMs (cold gemma4 can
  // take ~45s) see that the app is still working, not frozen.
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => {
    const resetId = setTimeout(() => setElapsedSeconds(0), 0);
    if (!isThinking) {
      return () => clearTimeout(resetId);
    }
    const start = Date.now();
    const id = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - start) / 1000));
    }, 500);
    return () => {
      clearTimeout(resetId);
      clearInterval(id);
    };
  }, [isThinking]);

  // Trigger the first orchestrator turn automatically when the workspace
  // loads with only the raw idea — that produces the first question.
  const lastMessage = messages[messages.length - 1];
  const onlyRawIdea =
    messages.length === 1 && messages[0].payload.kind === "raw_idea";

  // Per-project guard so React StrictMode's double-invocation in dev does
  // not fire two `/turn` requests and produce two first questions. We do
  // NOT use a cleanup-cancellation flag here on purpose: under StrictMode
  // the cleanup would race ahead of the fetch's response handler and
  // suppress router.refresh(), leaving the screen stale.
  const autoTriggeredFor = useRef<string | null>(null);
  useEffect(() => {
    if (isComplete) return;
    if (!onlyRawIdea) return;
    if (autoTriggeredFor.current === projectId) return;
    autoTriggeredFor.current = projectId;
    setAutoTriggerPending(true);
    void (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/turn`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (!res.ok) {
          autoTriggeredFor.current = null; // allow retry on next mount
          await toastResponseError(res, "Could not start conversation");
          return;
        }
        router.refresh();
      } catch (err) {
        autoTriggeredFor.current = null;
        toastThrownError(err, "Could not start conversation");
      } finally {
        setAutoTriggerPending(false);
      }
    })();
  }, [isComplete, onlyRawIdea, projectId, router]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, optimisticAnswer, isThinking]);

  const submit = () => {
    const text = draft.trim();
    if (isComplete) return;
    if (!text || pending) return;
    setOptimisticAnswer(text);
    setDraft("");
    startTransition(async () => {
      const res = await fetch(`/api/projects/${projectId}/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        await toastResponseError(res, "Could not send message");
        setOptimisticAnswer(null);
        return;
      }
      setOptimisticAnswer(null);
      router.refresh();
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  // The input stays available even while a recommendation is on the table —
  // the user can click a card *or* steer with free text.
  const awaitingRecommendation =
    lastMessage?.payload.kind === "recommendation" &&
    !lastMessage.payload.data.confirmedChoiceId;
  const placeholder = awaitingRecommendation
    ? "Pick a card above, or push back here…"
    : "Or just tell me what you think…";

  const generateBrief = () => {
    if (latestBriefId) {
      router.push(`/p/${projectId}/brief?v=${latestBriefId}`);
      return;
    }
    startTransition(async () => {
      const res = await fetch(`/api/projects/${projectId}/brief/regenerate`, {
        method: "POST",
      });
      if (!res.ok) {
        await toastResponseError(res, "Could not generate brief");
        return;
      }
      const data: { brief: { id: string } } = await res.json();
      router.push(`/p/${projectId}/brief?v=${data.brief.id}`);
    });
  };

  return (
    <section className="flex h-1/2 min-w-0 flex-1 flex-col lg:h-full">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          {messages.map((m) => (
            <ConversationMessageItem
              key={m.id}
              projectId={projectId}
              message={m}
            />
          ))}
          {optimisticAnswer && <UserBubble>{optimisticAnswer}</UserBubble>}
          {isThinking && (
            <ThinkingBubble
              hint={
                elapsedSeconds >= 3
                  ? `Thinking — ${elapsedSeconds}s${
                      elapsedSeconds >= 20 ? " (local model is warming up)" : ""
                    }`
                  : undefined
              }
            />
          )}
        </div>
      </div>
      <div className="border-t border-border/60 bg-background/80 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          {isComplete ? (
            <Button
              onClick={generateBrief}
              disabled={pending}
              className="w-full rounded-full py-6 text-base font-semibold"
            >
              {pending
                ? "Generating Brief…"
                : latestBriefId
                  ? "Open brief →"
                  : "Generate brief →"}
            </Button>
          ) : (
            <>
              <Textarea
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={placeholder}
                rows={1}
                className="min-h-[44px] resize-none"
                disabled={isThinking}
              />
              <Button
                size="icon"
                onClick={submit}
                disabled={!draft.trim() || isThinking}
                className="rounded-full"
              >
                <ArrowUp className="size-4" />
              </Button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
