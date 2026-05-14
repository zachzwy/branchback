"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, GitBranch, RefreshCw, Compass } from "lucide-react";
import { toast } from "sonner";
import { toastResponseError } from "@/lib/client-errors";
import { Button } from "@/components/ui/button";
import type { DecisionNode } from "@/lib/db/types";
import type { NodeClassification } from "@/lib/graph/lineage";
import { RevisitModal } from "./revisit-modal";

interface Props {
  projectId: string;
  decision: DecisionNode;
  otherActiveDecisions: DecisionNode[];
  cursorId?: string | null;
  classification?: NodeClassification | null;
  // When non-null, this decision is a direct child of a branch point and can
  // be re-attached (copied subtree-and-all) onto the on-path sibling whose
  // id is given here.
  reattachTargetId?: string | null;
}

export function InspectorActions({
  projectId,
  decision,
  otherActiveDecisions: _otherActiveDecisions,
  cursorId,
  classification,
  reattachTargetId,
}: Props) {
  const router = useRouter();
  const [revisitOpen, setRevisitOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const isCursor = cursorId === decision.id;
  const isOnPath = classification === "on_path";
  const isOffPath = classification === "off_path";

  const moveCursor = (successMessage: string) => {
    startTransition(async () => {
      const res = await fetch(`/api/projects/${projectId}/cursor`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisionId: decision.id }),
      });
      if (!res.ok) {
        await toastResponseError(res, "Could not move cursor");
        return;
      }
      toast.success(successMessage);
      router.refresh();
    });
  };

  const continueFromHere = () => moveCursor("Resumed from this decision.");
  const switchToBranch = () => moveCursor("Switched to this branch.");

  const reattachToCurrentBranch = () => {
    if (!reattachTargetId) return;
    startTransition(async () => {
      const res = await fetch(
        `/api/projects/${projectId}/decisions/${decision.id}/reattach`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetParentDecisionId: reattachTargetId }),
        },
      );
      if (!res.ok) {
        await toastResponseError(res, "Could not re-attach");
        return;
      }
      const data: { nextBriefId?: string | null } = await res
        .json()
        .catch(() => ({}));
      if (data.nextBriefId) {
        toast.success("Brought over. Brief regenerated for you to review.");
        router.push(`/p/${projectId}/brief?v=${data.nextBriefId}`);
      } else {
        toast.success("Brought over. Picking up the conversation from here.");
        router.push(`/p/${projectId}`);
      }
    });
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => setRevisitOpen(true)}
          disabled={pending}
          className="rounded-full"
        >
          <RefreshCw className="size-3.5" />
          Revisit this decision
        </Button>
        {isOnPath && cursorId !== undefined && cursorId !== null && !isCursor && (
          <Button
            size="sm"
            variant="ghost"
            onClick={continueFromHere}
            disabled={pending}
            className="rounded-full"
          >
            <ArrowRight className="size-3.5" />
            Continue from here
          </Button>
        )}
        {isOffPath && (
          <Button
            size="sm"
            variant="ghost"
            onClick={switchToBranch}
            disabled={pending}
            className="rounded-full"
          >
            <Compass className="size-3.5" />
            Switch to this branch
          </Button>
        )}
        {reattachTargetId && (
          <Button
            size="sm"
            variant="ghost"
            onClick={reattachToCurrentBranch}
            disabled={pending}
            className="rounded-full"
          >
            <GitBranch className="size-3.5" />
            Re-attach to current branch
          </Button>
        )}
      </div>
      <RevisitModal
        projectId={projectId}
        decision={decision}
        otherActiveDecisions={_otherActiveDecisions}
        isOffPath={isOffPath}
        open={revisitOpen}
        onOpenChange={setRevisitOpen}
      />
    </>
  );
}
