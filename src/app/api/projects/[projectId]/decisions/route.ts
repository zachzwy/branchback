import { NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/db";
import type { ConversationPayload, RecommendationOption } from "@/lib/db/types";
import { getSession } from "@/lib/firebase/session";
import { compileProductStory } from "@/server/productStory/compile";
import { sha256 } from "@/server/hashing";
import { getOrchestrator } from "@/server/orchestrator";
import { buildDepthPolicyContext } from "@/server/orchestrator/depth-policy";
import type { OrchestratorAction } from "@/server/orchestrator/types";
import { RateLimitExceededError, rateLimitResponse } from "@/server/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 120;

const PostSchema = z.object({
  messageId: z.string().min(1),
  choiceId: z.string().min(1),
});

interface RouteCtx {
  params: Promise<{ projectId: string }>;
}

const DEFAULT_AFFECTS: Record<string, string[]> = {
  user_narrowing: ["persona", "MVP CUJ list", "success metrics"],
  problem_clarification: ["positioning", "core problem framing"],
  outcome_definition: ["success metrics", "MVP CUJ list"],
  solution_direction: ["MVP CUJ list", "feature set"],
  mvp_scoping: ["critical user journeys", "edge cases", "delivery plan"],
};

function actionToPayload(action: OrchestratorAction): ConversationPayload {
  if (action.type === "ask_question") {
    return {
      kind: "question",
      data: { text: action.payload.text, phaseKey: action.payload.phaseKey },
    };
  }
  return {
    kind: "recommendation",
    data: {
      ...action.payload,
      confirmedChoiceId: null,
    },
  };
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
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
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

  const recMessage = workspace.messages.find(
    (m) => m.id === parsed.data.messageId,
  );
  if (!recMessage || recMessage.payload.kind !== "recommendation") {
    return NextResponse.json(
      { error: "recommendation_not_found" },
      { status: 404 },
    );
  }
  if (recMessage.payload.data.confirmedChoiceId) {
    return NextResponse.json(
      { error: "already_confirmed" },
      { status: 409 },
    );
  }

  const rec = recMessage.payload.data;
  const chosen: RecommendationOption | null =
    rec.recommended.id === parsed.data.choiceId
      ? rec.recommended
      : rec.alternative.id === parsed.data.choiceId
        ? rec.alternative
        : null;
  if (!chosen) {
    return NextResponse.json({ error: "invalid_choice" }, { status: 400 });
  }
  const rejected =
    chosen.id === rec.recommended.id ? rec.alternative : rec.recommended;
  const isAgentRecommended = chosen.id === rec.recommended.id;
  const affects = DEFAULT_AFFECTS[rec.phaseKey] ?? [rec.phaseKey];

  // 1. AIGeneration row first so the decision can reference it.
  const generation = await repo.insertAIGeneration({
    userId: session.uid,
    projectId,
    module: "decision_extractor",
    capabilityTier: "decision_graph_mutation",
    routingPolicy: "mock",
    providerId: "mock",
    modelId: "mock-v1",
    promptVersion: "mock.v1",
    inputHash: sha256({ messageId: recMessage.id, choiceId: chosen.id }),
    outputHash: sha256({ chosen, rejected }),
    providerCallStatus: "success",
    validatorStatus: "passed",
    userVisible: false,
    committedToGraph: true,
    latencyMs: 1,
  });

  // 2. DecisionNode capturing the confirmed choice + the rejected alternative.
  const decision = await repo.insertDecisionNode({
    userId: session.uid,
    projectId,
    phaseKey: rec.phaseKey,
    nodeType: `${rec.phaseKey}_choice`,
    title: chosen.title,
    rationale: chosen.rationale,
    confidence: chosen.confidence,
    madeBy: isAgentRecommended
      ? "agent_recommendation_confirmed_by_user"
      : "user_direct",
    alternatives: [
      {
        title: rejected.title,
        rationale: rejected.rationale,
        confidence: rejected.confidence,
      },
    ],
    affectedAreas: affects,
    sourceMessageId: recMessage.id,
    aiGenerationId: generation.id,
  });

  // 3. Recompile Product Story and snapshot it.
  const refreshed = await repo.getProjectWorkspace({
    userId: session.uid,
    projectId,
  });
  const newPayload = compileProductStory({
    decisions: refreshed?.decisions ?? [],
    edges: refreshed?.edges ?? [],
    cursorId: refreshed?.project.currentDecisionId ?? null,
  });
  const snapshot = await repo.insertProductStateSnapshot({
    userId: session.uid,
    projectId,
    payload: newPayload,
    triggeredByDecisionId: decision.id,
  });

  // 4. Mark the recommendation message as confirmed (so buttons stay disabled).
  await repo.updateRecommendationConfirmation({
    userId: session.uid,
    projectId,
    messageId: recMessage.id,
    confirmedChoiceId: chosen.id,
  });

  // 5. Append acknowledgement message.
  const ackText = `Focus on ${chosen.title.toLowerCase()}`;
  const ackMessage = await repo.appendMessage({
    userId: session.uid,
    projectId,
    role: "assistant",
    payload: {
      kind: "acknowledgement",
      data: {
        text: ackText,
        affects,
        decisionId: decision.id,
      },
    },
  });

  // 6. Continue the conversation on the newly active phase.
  const nextWorkspace = await repo.getProjectWorkspace({
    userId: session.uid,
    projectId,
  });
  const nextAssistantMessages = [];
  let nextGenerationId: string | null = null;
  if (nextWorkspace) {
    const activePhase = nextWorkspace.phases.find(
      (p) => p.status === "active",
    )?.key;
    if (activePhase) {
      const turnInput = {
        userId: session.uid,
        projectId,
        planningDepth: nextWorkspace.project.planningDepth,
        currentPhaseKey: activePhase,
        depthPolicy: buildDepthPolicyContext({
          planningDepth: nextWorkspace.project.planningDepth,
          currentPhaseKey: activePhase,
          messages: nextWorkspace.messages,
        }),
        turnIndex: nextWorkspace.messages.length,
        productStory: snapshot.payload,
        recentMessages: nextWorkspace.messages
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

      let result;
      try {
        result = await getOrchestrator().runTurn(turnInput);
      } catch (err) {
        if (err instanceof RateLimitExceededError) {
          return rateLimitResponse(err);
        }
        throw err;
      }
      const nextGeneration = await repo.insertAIGeneration({
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
      nextGenerationId = nextGeneration.id;

      for (const action of result.actions) {
        const msg = await repo.appendMessage({
          userId: session.uid,
          projectId,
          role: "assistant",
          payload: actionToPayload(action),
        });
        nextAssistantMessages.push(msg);
      }
    }
  }

  return NextResponse.json({
    decision,
    snapshot,
    ackMessage,
    generationId: generation.id,
    nextAssistantMessages,
    nextGenerationId,
  });
}
