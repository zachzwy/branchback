import { NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/db";
import type { ConversationMessage } from "@/lib/db/types";
import { PHASE_TITLES } from "@/lib/db/types";
import { getSession } from "@/lib/firebase/session";
import { getOrchestrator } from "@/server/orchestrator";
import { buildDepthPolicyContext } from "@/server/orchestrator/depth-policy";
import { actionToPayload } from "@/server/orchestrator/payload";
import type { OrchestratorTurnInput } from "@/server/orchestrator/types";
import { compileAndPersistBrief } from "@/server/brief/persist";
import { compileProductStory } from "@/server/productStory/compile";
import { sha256 } from "@/server/hashing";
import { RateLimitExceededError, rateLimitResponse } from "@/server/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 120;

const PostSchema = z.object({
  newTitle: z.string().trim().min(1).max(120),
  newRationale: z.string().trim().min(1).max(800),
  newConfidence: z.number().min(0).max(1).optional(),
  reason: z.string().trim().max(400).nullable().optional(),
});

interface RouteCtx {
  params: Promise<{ projectId: string; decisionId: string }>;
}

export async function POST(req: Request, ctx: RouteCtx) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { projectId, decisionId } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_input",
        detail: parsed.error.issues.map((i) => i.message).join("; "),
      },
      { status: 400 },
    );
  }

  const repo = getRepository();
  const workspace = await repo.getProjectWorkspace({
    userId: session.uid,
    projectId,
  });
  if (!workspace) {
    return NextResponse.json({ error: "project_not_found" }, { status: 404 });
  }

  const original = workspace.decisions.find((d) => d.id === decisionId);
  if (!original) {
    return NextResponse.json(
      { error: "decision_not_found_or_inactive" },
      { status: 404 },
    );
  }

  // 1. Provenance row for the pivot.
  const generation = await repo.insertAIGeneration({
    userId: session.uid,
    projectId,
    module: "branch_manager",
    capabilityTier: "decision_graph_mutation",
    routingPolicy: "mock",
    providerId: "mock",
    modelId: "mock-v1",
    promptVersion: "pivot.v1",
    inputHash: sha256({
      decisionId,
      replacement: parsed.data,
    }),
    outputHash: sha256({ pivotFrom: decisionId, to: parsed.data.newTitle }),
    providerCallStatus: "success",
    validatorStatus: "passed",
    userVisible: false,
    committedToGraph: true,
    latencyMs: 1,
  });

  let result;
  try {
    result = await repo.pivotDecision({
      userId: session.uid,
      projectId,
      originalDecisionId: decisionId,
      replacement: {
        title: parsed.data.newTitle,
        rationale: parsed.data.newRationale,
        confidence: parsed.data.newConfidence ?? original.confidence,
      },
      reason: parsed.data.reason ?? null,
      aiGenerationId: generation.id,
    });
  } catch (err) {
    const msg = (err as Error).message;
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // 2. Recompile Product Story off the post-pivot branch.
  const refreshed = await repo.getProjectWorkspace({
    userId: session.uid,
    projectId,
  });
  const newPayload = compileProductStory({
    decisions: refreshed?.decisions ?? [],
    edges: refreshed?.edges ?? [],
    cursorId: refreshed?.project.currentDecisionId ?? null,
  });
  await repo.insertProductStateSnapshot({
    userId: session.uid,
    projectId,
    payload: newPayload,
    triggeredByDecisionId: result.replacementDecision.id,
  });

  // 3. Append a conversational acknowledgement so the workspace shows the
  // pivot inline next time the user opens it.
  await repo.appendMessage({
    userId: session.uid,
    projectId,
    role: "assistant",
    payload: {
      kind: "acknowledgement",
      data: {
        text: `Pivoted to "${result.replacementDecision.title}"`,
        affects: original.affectedAreas,
        decisionId: result.replacementDecision.id,
      },
    },
  });

  // 4. Continue from the post-pivot state:
  //    - If a phase is active, run the orchestrator so the next question is
  //      already in the DB by the time the user lands on the conversation.
  //    - If every phase is complete, the planning loop is done — auto-compile
  //      a fresh brief version for the user to review.
  const post = await repo.getProjectWorkspace({
    userId: session.uid,
    projectId,
  });
  const assistantMessages: ConversationMessage[] = [];
  let nextBriefId: string | null = null;

  if (post) {
    const activePhase = post.phases.find((p) => p.status === "active")?.key;
    if (activePhase) {
      // Synthetic user-side framing of the pivot. Not persisted; it's
      // appended only to the orchestrator's view of recentMessages so the
      // LLM treats this turn as a continuation, not a fresh project. We
      // also set `userMessage` so the Ollama orchestrator skips its
      // "begin the conversation" nudge (which fires when userMessage is
      // absent and is what otherwise makes the next question read like a
      // project-restart).
      const pivotNote = `I'm pivoting "${original.title}" to "${result.replacementDecision.title}" in ${PHASE_TITLES[original.phaseKey]}. Reason: ${result.replacementDecision.rationale} Continue from here, taking the rest of the conversation into account.`;

      const recentMessages = post.messages
        .slice(-30)
        .map((m) => ({
          id: m.id,
          role: m.role,
          kind: m.kind,
          payload: m.payload,
          turnIndex: m.turnIndex,
          createdAt: m.createdAt,
        }));
      const lastTurnIndex = recentMessages.at(-1)?.turnIndex ?? -1;
      const pivotEntry: (typeof recentMessages)[number] = {
        id: "synthetic-pivot",
        role: "user",
        kind: "answer",
        payload: { kind: "answer", data: { text: pivotNote } },
        turnIndex: lastTurnIndex + 1,
        createdAt: new Date().toISOString(),
      };

      const turnInput: OrchestratorTurnInput = {
        userId: session.uid,
        projectId,
        planningDepth: post.project.planningDepth,
        currentPhaseKey: activePhase,
        depthPolicy: buildDepthPolicyContext({
          planningDepth: post.project.planningDepth,
          currentPhaseKey: activePhase,
          messages: post.messages,
        }),
        turnIndex: post.messages.length,
        userMessage: { text: pivotNote },
        productStory:
          post.latestSnapshot?.payload ?? {
            whoItsFor: null,
            problem: null,
            successLooksLike: null,
            solution: null,
            mvpFocus: null,
            openQuestion: null,
          },
        recentMessages: [...recentMessages, pivotEntry],
      };

      try {
        const orchestrator = getOrchestrator();
        const turn = await orchestrator.runTurn(turnInput);

        const turnGeneration = await repo.insertAIGeneration({
          userId: session.uid,
          projectId,
          module: turn.generation.module,
          capabilityTier: turn.generation.capabilityTier,
          routingPolicy: turn.generation.routingPolicy,
          providerId: turn.generation.providerId,
          modelId: turn.generation.modelId,
          promptVersion: turn.generation.promptVersion,
          inputHash: turn.generation.inputHash,
          outputHash: turn.generation.outputHash,
          providerCallStatus: turn.generation.providerCallStatus,
          validatorStatus: turn.generation.validatorStatus,
          userVisible: true,
          committedToGraph: false,
          latencyMs: turn.generation.latencyMs,
        });
        // Currently unused but keeps the AIGeneration row referenced for
        // future linking.
        void turnGeneration;

        for (const action of turn.actions) {
          const msg = await repo.appendMessage({
            userId: session.uid,
            projectId,
            role: "assistant",
            payload: actionToPayload(action),
          });
          assistantMessages.push(msg);
        }
      } catch (err) {
        if (err instanceof RateLimitExceededError) return rateLimitResponse(err);
        // Don't fail the whole pivot if the orchestrator hiccups — the
        // pivot already persisted. The user lands on the conversation
        // with the acknowledgement and can prompt manually.
        console.error("revisit_orchestrator_failed", err);
      }
    } else {
      try {
        const brief = await compileAndPersistBrief({
          repo,
          userId: session.uid,
          workspace: post,
          triggeredByDecisionId: result.replacementDecision.id,
        });
        nextBriefId = brief.id;
      } catch (err) {
        if (err instanceof RateLimitExceededError) return rateLimitResponse(err);
        console.error("revisit_brief_compile_failed", err);
      }
    }
  }

  return NextResponse.json({
    originalDecision: result.originalDecision,
    replacementDecision: result.replacementDecision,
    lineageEdge: result.lineageEdge,
    generationId: generation.id,
    assistantMessages,
    nextBriefId,
  });
}
