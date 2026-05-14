import { NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/db";
import type { ConversationMessage } from "@/lib/db/types";
import { PHASE_TITLES } from "@/lib/db/types";
import { getSession } from "@/lib/firebase/session";
import { compileAndPersistBrief } from "@/server/brief/persist";
import { compileProductStory } from "@/server/productStory/compile";
import { getOrchestrator } from "@/server/orchestrator";
import { buildDepthPolicyContext } from "@/server/orchestrator/depth-policy";
import { actionToPayload } from "@/server/orchestrator/payload";
import type { OrchestratorTurnInput } from "@/server/orchestrator/types";
import { RateLimitExceededError, rateLimitResponse } from "@/server/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 120;

const PostSchema = z.object({
  targetParentDecisionId: z.string().min(1),
});

interface RouteCtx {
  params: Promise<{ projectId: string; decisionId: string }>;
}

// Copy the off-path subtree rooted at `decisionId` onto the active branch
// under `targetParentDecisionId`. Each node in the subtree gets a fresh ID
// on the new branch so the original branch (and its brief continuity) stays
// intact and revisitable. After copying we mirror the revisit flow: post an
// acknowledgement message, then either run the orchestrator (if a phase is
// still active on the new lineage) or auto-compile a fresh brief (if every
// phase is now complete). Either way the user lands on a non-empty workspace.
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
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const repo = getRepository();
  // Capture the source decision title before the copy so the acknowledgement
  // text reads naturally ("Brought 'X' over to this branch").
  const pre = await repo.getProjectWorkspace({
    userId: session.uid,
    projectId,
  });
  if (!pre) {
    return NextResponse.json({ error: "project_not_found" }, { status: 404 });
  }
  const sourceDecision = pre.decisions.find((d) => d.id === decisionId);
  if (!sourceDecision) {
    return NextResponse.json(
      { error: "subtree_root_not_found" },
      { status: 404 },
    );
  }

  let result;
  try {
    result = await repo.copySubtreeOntoBranch({
      userId: session.uid,
      projectId,
      subtreeRootId: decisionId,
      targetParentId: parsed.data.targetParentDecisionId,
    });
  } catch (err) {
    const msg = (err as Error).message;
    const status =
      msg === "subtree_root_not_found" || msg === "target_parent_not_found"
        ? 404
        : msg === "project_forbidden"
          ? 403
          : 500;
    return NextResponse.json({ error: msg }, { status });
  }

  // 1. Snapshot the new product story off the post-copy lineage.
  const refreshed = await repo.getProjectWorkspace({
    userId: session.uid,
    projectId,
  });
  if (refreshed) {
    const payload = compileProductStory({
      decisions: refreshed.decisions,
      edges: refreshed.edges,
      cursorId: refreshed.project.currentDecisionId,
    });
    await repo.insertProductStateSnapshot({
      userId: session.uid,
      projectId,
      payload,
      triggeredByDecisionId: result.cursorDecisionId,
    });
  }

  // 2. Acknowledgement message so the conversation panel reflects the action.
  await repo.appendMessage({
    userId: session.uid,
    projectId,
    role: "assistant",
    payload: {
      kind: "acknowledgement",
      data: {
        text: `Brought "${sourceDecision.title}" and its decisions over to this branch`,
        affects: sourceDecision.affectedAreas,
        decisionId: result.cursorDecisionId,
      },
    },
  });

  // 3. Continue from the post-copy state — same shape as revisit.
  const post = await repo.getProjectWorkspace({
    userId: session.uid,
    projectId,
  });
  const assistantMessages: ConversationMessage[] = [];
  let nextBriefId: string | null = null;

  if (post) {
    const activePhase = post.phases.find((p) => p.status === "active")?.key;
    if (activePhase) {
      const reattachNote = `I brought my "${sourceDecision.title}" decision (${PHASE_TITLES[sourceDecision.phaseKey]}) and the decisions that followed it over from another branch. Continue from here, taking the rest of the conversation into account.`;

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
      const reattachEntry: (typeof recentMessages)[number] = {
        id: "synthetic-reattach",
        role: "user",
        kind: "answer",
        payload: { kind: "answer", data: { text: reattachNote } },
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
        userMessage: { text: reattachNote },
        productStory:
          post.latestSnapshot?.payload ?? {
            whoItsFor: null,
            problem: null,
            successLooksLike: null,
            solution: null,
            mvpFocus: null,
            openQuestion: null,
          },
        recentMessages: [...recentMessages, reattachEntry],
      };

      try {
        const orchestrator = getOrchestrator();
        const turn = await orchestrator.runTurn(turnInput);

        await repo.insertAIGeneration({
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
        // Don't fail the whole re-attach if the orchestrator hiccups — the
        // copy already persisted. The user lands on the conversation with
        // the acknowledgement and can prompt manually.
        console.error("reattach_orchestrator_failed", err);
      }
    } else {
      try {
        const brief = await compileAndPersistBrief({
          repo,
          userId: session.uid,
          workspace: post,
          triggeredByDecisionId: result.cursorDecisionId,
        });
        nextBriefId = brief.id;
      } catch (err) {
        if (err instanceof RateLimitExceededError) return rateLimitResponse(err);
        console.error("reattach_brief_compile_failed", err);
      }
    }
  }

  return NextResponse.json({
    ...result,
    assistantMessages,
    nextBriefId,
  });
}
