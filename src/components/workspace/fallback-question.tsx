"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { toastResponseError } from "@/lib/client-errors";
import { Button } from "@/components/ui/button";
import { AssistantBubble } from "./message-bubbles";

interface Props {
  projectId: string;
  text: string;
  canRetry: boolean;
}

// Rendered for the orchestrator's "(Model unavailable. Tell me more in the
// meantime?)" fallback. Adds a retry button that POSTs to /turn with
// `text: "retry"` so the model re-runs the turn just like a normal user message.
// Only shown when this is the last message in the conversation — once the user
// has moved on (typed a real answer / clicked a card / asked a clarification),
// retrying the old fallback no longer makes sense.
export function FallbackQuestion({ projectId, text, canRetry }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const retry = () => {
    startTransition(async () => {
      const res = await fetch(`/api/projects/${projectId}/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "retry" }),
      });
      if (!res.ok) {
        await toastResponseError(res, "Retry failed");
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-2 self-start">
      <AssistantBubble tone="muted">{text}</AssistantBubble>
      {canRetry && (
        <Button
          size="sm"
          variant="outline"
          onClick={retry}
          disabled={pending}
          className="self-start rounded-full"
        >
          <RotateCcw className="size-3.5" />
          {pending ? "Retrying…" : "Retry"}
        </Button>
      )}
    </div>
  );
}
