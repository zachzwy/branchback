"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { toastResponseError } from "@/lib/client-errors";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { DecisionNode } from "@/lib/db/types";
import { PHASE_TITLES } from "@/lib/db/types";
import { cn } from "@/lib/utils";

interface Props {
  projectId: string;
  decision: DecisionNode;
  otherActiveDecisions: DecisionNode[];
  // Off-path = the user is revisiting a decision on a branch they're not
  // currently on. The modal copy switches to make it clear that "Try a
  // different direction" still creates a *new* branch (not a return to the
  // current one).
  isOffPath?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = "choose" | "compose";

export function RevisitModal({
  projectId,
  decision,
  otherActiveDecisions,
  isOffPath = false,
  open,
  onOpenChange,
}: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("choose");
  const [pending, startTransition] = useTransition();
  const [draftTitle, setDraftTitle] = useState("");
  const [draftRationale, setDraftRationale] = useState("");
  const [draftConfidence, setDraftConfidence] = useState<number>(
    decision.confidence,
  );

  const close = () => {
    onOpenChange(false);
    setTimeout(() => {
      setStep("choose");
      setDraftTitle("");
      setDraftRationale("");
      setDraftConfidence(decision.confidence);
    }, 200);
  };

  const usePresetAlternative = (alt: DecisionNode["alternatives"][number]) => {
    setDraftTitle(alt.title);
    setDraftRationale(alt.rationale);
    setDraftConfidence(alt.confidence);
    setStep("compose");
  };

  const submit = () => {
    if (!draftTitle.trim() || !draftRationale.trim() || pending) return;
    startTransition(async () => {
      const res = await fetch(
        `/api/projects/${projectId}/decisions/${decision.id}/revisit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newTitle: draftTitle.trim(),
            newRationale: draftRationale.trim(),
            newConfidence: draftConfidence,
            reason: null,
          }),
        },
      );
      if (!res.ok) {
        await toastResponseError(res, "Could not revisit decision");
        return;
      }
      const data: { nextBriefId?: string | null } = await res
        .json()
        .catch(() => ({}));
      // Route based on what the server produced post-pivot:
      //   - new brief id → land on the freshly-generated brief version
      //   - otherwise → conversation page, where the agent's next question
      //     (also persisted server-side during the pivot) is waiting.
      if (data.nextBriefId) {
        toast.success("Pivoted. Brief regenerated for you to review.");
        close();
        router.push(`/p/${projectId}/brief?v=${data.nextBriefId}`);
      } else {
        toast.success(
          "Pivoted. Picking up the conversation from your new direction.",
        );
        close();
        router.push(`/p/${projectId}`);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            Want to revisit {phaseHeadline(decision.phaseKey)}?
          </DialogTitle>
          <DialogDescription>
            You chose <span className="font-medium">{decision.title}</span> in{" "}
            {PHASE_TITLES[decision.phaseKey]}. Here&apos;s the reasoning at the
            time:
          </DialogDescription>
        </DialogHeader>

        <blockquote className="rounded-md border-l-2 border-foreground/40 bg-muted/40 px-4 py-3 text-[15.6px] italic leading-snug text-muted-foreground">
          &ldquo;{decision.rationale}&rdquo;
        </blockquote>

        <ImpactPanel
          decision={decision}
          otherActiveDecisions={otherActiveDecisions}
        />

        {step === "choose" && (
          <ChoosePanel
            decision={decision}
            isOffPath={isOffPath}
            onTryDifferent={() => setStep("compose")}
            onPickAlternative={usePresetAlternative}
            onCancel={close}
          />
        )}

        {step === "compose" && (
          <ComposePanel
            title={draftTitle}
            rationale={draftRationale}
            confidence={draftConfidence}
            pending={pending}
            onTitleChange={setDraftTitle}
            onRationaleChange={setDraftRationale}
            onConfidenceChange={setDraftConfidence}
            onCancel={() => setStep("choose")}
            onSubmit={submit}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function phaseHeadline(phase: DecisionNode["phaseKey"]): string {
  switch (phase) {
    case "user_narrowing":
      return "who this is for";
    case "problem_clarification":
      return "the problem";
    case "outcome_definition":
      return "what success looks like";
    case "solution_direction":
      return "the solution direction";
    case "mvp_scoping":
      return "the MVP CUJ list";
    case "product_loops":
      return "the product loop";
    case "risks_assumptions":
      return "this assumption";
    default:
      return "this decision";
  }
}

function ImpactPanel({
  decision,
  otherActiveDecisions,
}: {
  decision: DecisionNode;
  otherActiveDecisions: DecisionNode[];
}) {
  const unaffected = otherActiveDecisions
    .filter((d) => d.id !== decision.id && d.phaseKey !== decision.phaseKey)
    .slice(0, 4);

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
        If we change this, it affects
      </div>
      <div className="flex flex-wrap gap-1.5">
        {decision.affectedAreas.length === 0 ? (
          <span className="text-[14.4px] italic text-muted-foreground">
            No downstream impact recorded.
          </span>
        ) : (
          decision.affectedAreas.map((a) => (
            <span
              key={a}
              className="rounded-full border border-red-300/70 bg-red-50 px-2 py-0.5 text-[13.2px] text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
            >
              ⚠ {a}
            </span>
          ))
        )}
        {unaffected.map((d) => (
          <span
            key={d.id}
            className="rounded-full border border-emerald-300/70 bg-emerald-50 px-2 py-0.5 text-[13.2px] text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200"
            title={`From ${PHASE_TITLES[d.phaseKey]}`}
          >
            ✓ {d.title}
          </span>
        ))}
      </div>
    </div>
  );
}

function ChoosePanel({
  decision,
  isOffPath,
  onTryDifferent,
  onPickAlternative,
  onCancel,
}: {
  decision: DecisionNode;
  isOffPath: boolean;
  onTryDifferent: () => void;
  onPickAlternative: (alt: DecisionNode["alternatives"][number]) => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-2">
        <button
          type="button"
          onClick={onTryDifferent}
          className={cn(
            "flex flex-col items-start gap-1 rounded-md border border-blue-300/70 bg-blue-50/60 p-3 text-left transition hover:bg-blue-50 dark:border-blue-900/60 dark:bg-blue-950/30 dark:hover:bg-blue-950/50",
          )}
        >
          <div className="text-[15.6px] font-semibold text-blue-900 dark:text-blue-100">
            Try a different direction
          </div>
          <div className="text-[13.2px] leading-snug text-blue-900/80 dark:text-blue-200/80">
            {isOffPath
              ? "Starts a new branch from this point — separate from the one you're currently on. Both branches stay visible. To resume the original branch instead, use “Switch to this branch.”"
              : "Starts a new branch from this point. The original choice and everything downstream of it stay intact on their own branch — you can come back and pick them up any time."}
          </div>
        </button>
      </div>

      {decision.alternatives.length > 0 && (
        <div className="flex flex-col gap-2 rounded-md border border-dashed border-border/60 bg-muted/20 p-3">
          <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
            Or pick from the alternatives we recorded
          </div>
          <div className="flex flex-col gap-1.5">
            {decision.alternatives.map((alt) => (
              <button
                key={alt.title}
                type="button"
                onClick={() => onPickAlternative(alt)}
                className="flex flex-col items-start gap-0.5 rounded-md border border-border/60 bg-background p-2 text-left text-[14.4px] leading-snug transition hover:border-foreground/40"
              >
                <span className="font-medium">{alt.title}</span>
                <span className="text-muted-foreground">{alt.rationale}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <DialogFooter className="gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onCancel}
          className="rounded-full"
        >
          Cancel
        </Button>
      </DialogFooter>
    </div>
  );
}

function ComposePanel({
  title,
  rationale,
  confidence,
  pending,
  onTitleChange,
  onRationaleChange,
  onConfidenceChange,
  onCancel,
  onSubmit,
}: {
  title: string;
  rationale: string;
  confidence: number;
  pending: boolean;
  onTitleChange: (v: string) => void;
  onRationaleChange: (v: string) => void;
  onConfidenceChange: (v: number) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const valid = title.trim().length > 0 && rationale.trim().length > 0;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
          New direction
        </label>
        <Input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="e.g. Curious learners"
          autoFocus
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
          Why this instead
        </label>
        <Textarea
          value={rationale}
          onChange={(e) => onRationaleChange(e.target.value)}
          placeholder="Capture the reasoning so future-you remembers the pivot."
          rows={3}
        />
      </div>
      <div className="flex items-center gap-3">
        <label className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
          Confidence
        </label>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(confidence * 100)}
          onChange={(e) => onConfidenceChange(Number(e.target.value) / 100)}
          className="flex-1 accent-foreground"
        />
        <span className="w-10 text-right text-xs tabular-nums">
          {Math.round(confidence * 100)}%
        </span>
      </div>
      <DialogFooter className="gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          className="rounded-full"
        >
          Back
        </Button>
        <Button
          size="sm"
          onClick={onSubmit}
          disabled={!valid || pending}
          className="rounded-full"
        >
          {pending ? "Pivoting…" : "Pivot to this"}
        </Button>
      </DialogFooter>
    </div>
  );
}
