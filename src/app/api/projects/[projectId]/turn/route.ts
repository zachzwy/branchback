import { NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/db";
import type { ConversationMessage } from "@/lib/db/types";
import { getSession } from "@/lib/firebase/session";
import { getOrchestrator } from "@/server/orchestrator";
import { buildDepthPolicyContext } from "@/server/orchestrator/depth-policy";
import { actionToPayload } from "@/server/orchestrator/payload";
import type { OrchestratorTurnInput } from "@/server/orchestrator/types";
import { compileAndPersistBrief } from "@/server/brief/persist";
import { RateLimitExceededError, rateLimitResponse } from "@/server/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 120;

const PostSchema = z.object({
  text: z.string().trim().min(1).optional(),
});

interface RouteCtx {
  params: Promise<{ projectId: string }>;
}

export async function POST(req: Request, ctx: RouteCtx) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { projectId } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const repo = getRepository();
  const workspace = await repo.getProjectWorkspace({
    userId: session.uid,
    projectId,
  });
  if (!workspace) {
    return NextResponse.json({ error: "project_not_found" }, { status: 404 });
  }

  // 1. Persist the incoming user answer if any.
  let userMessage: ConversationMessage | null = null;
  if (parsed.data.text) {
    userMessage = await repo.appendMessage({
      userId: session.uid,
      projectId,
      role: "user",
      payload: { kind: "answer", data: { text: parsed.data.text } },
    });
  }

  // 2. Compose orchestrator input. Include the user message we just inserted
  // so the orchestrator (esp. the LLM-backed ones) sees it in chat history.
  const allMessages = userMessage
    ? [...workspace.messages, userMessage]
    : workspace.messages;
  const activePhase = workspace.phases.find((p) => p.status === "active")?.key;
  if (!activePhase) {
    // All phases complete — auto-generate a brief.
    let briefId: string | null = null;
    try {
      const brief = await compileAndPersistBrief({
        repo,
        userId: session.uid,
        workspace,
        triggeredByDecisionId: workspace.project.currentDecisionId,
      });
      briefId = brief.id;
    } catch (err) {
      if (err instanceof RateLimitExceededError) return rateLimitResponse(err);
      console.error("brief_generation_failed", err);
    }
    return NextResponse.json({
      userMessage,
      assistantMessages: [],
      generationId: null,
      complete: true,
      briefId,
    });
  }
  const turnInput: OrchestratorTurnInput = {
    userId: session.uid,
    projectId,
    planningDepth: workspace.project.planningDepth,
    currentPhaseKey: activePhase,
    depthPolicy: buildDepthPolicyContext({
      planningDepth: workspace.project.planningDepth,
      currentPhaseKey: activePhase,
      messages: allMessages,
    }),
    turnIndex: allMessages.length,
    userMessage: parsed.data.text ? { text: parsed.data.text } : undefined,
    productStory:
      workspace.latestSnapshot?.payload ?? {
        whoItsFor: null,
        problem: null,
        successLooksLike: null,
        solution: null,
        mvpFocus: null,
        openQuestion: null,
      },
    recentMessages: allMessages
      .slice(-30)
      .map((m) => ({
        id: m.id,
        role: m.role,
        kind: m.kind,
        payload: m.payload,
        turnIndex: m.turnIndex,
        createdAt: m.createdAt,
      })),
  };

  // 3. Run the orchestrator.
  const orchestrator = getOrchestrator();
  let result: Awaited<ReturnType<typeof orchestrator.runTurn>>;
  try {
    result = await orchestrator.runTurn(turnInput);
  } catch (err) {
    if (err instanceof RateLimitExceededError) return rateLimitResponse(err);
    throw err;
  }

  // 4. Log AIGeneration for provenance — mock or real.
  const generation = await repo.insertAIGeneration({
    userId: session.uid,
    projectId,
    module: result.generation.module,
    capabilityTier: result.generation.capabilityTier,
    routingPolicy: result.generation.routingPolicy,
    providerId: result.generation.providerId,
    modelId: result.generation.modelId,
    promptVersion: result.generation.promptVersion,
    inputHash: result.generation.inputHash,
    outputHash: result.generation.outputHash,
    providerCallStatus: result.generation.providerCallStatus,
    validatorStatus: result.generation.validatorStatus,
    userVisible: true,
    committedToGraph: false,
    latencyMs: result.generation.latencyMs,
  });

  // 5. Persist each emitted action as an assistant message.
  const persisted: ConversationMessage[] = [];
  for (const action of result.actions) {
    const msg = await repo.appendMessage({
      userId: session.uid,
      projectId,
      role: "assistant",
      payload: actionToPayload(action),
    });
    persisted.push(msg);
  }

  return NextResponse.json({
    userMessage,
    assistantMessages: persisted,
    generationId: generation.id,
  });
}
