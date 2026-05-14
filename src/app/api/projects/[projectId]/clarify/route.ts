import { NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/db";
import { PHASE_TITLES, type ConversationMessage } from "@/lib/db/types";
import { getSession } from "@/lib/firebase/session";
import { callDirectLLM } from "@/server/llm/direct";
import { RateLimitExceededError, rateLimitResponse } from "@/server/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 120;

const PostSchema = z.object({
  messageId: z.string().min(1),
  question: z.string().trim().min(1).max(2000),
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
  const { messageId, question } = parsed.data;

  const repo = getRepository();
  const workspace = await repo.getProjectWorkspace({
    userId: session.uid,
    projectId,
  });
  if (!workspace) {
    return NextResponse.json({ error: "project_not_found" }, { status: 404 });
  }

  const target = workspace.messages.find((m) => m.id === messageId);
  if (!target || target.payload.kind !== "recommendation") {
    return NextResponse.json(
      { error: "recommendation_not_found" },
      { status: 404 },
    );
  }
  const rec = target.payload.data;

  // Build a focused prose prompt. No JSON mode, no structured action — we
  // explicitly want a 1–3 paragraph comparison/answer, never a follow-up
  // question or a new recommendation.
  const system = `You are Branchback, an AI product strategist. The founder is uncertain about a pending recommendation and asked an open question. Provide a thoughtful, concrete answer in plain prose — 1 to 3 short paragraphs. Compare the options honestly when relevant, acknowledge real tradeoffs, and be specific to their idea. Do NOT make a new recommendation, do NOT ask the founder a follow-up question, do NOT output JSON or markdown headings. Just answer.`;

  const recapLines = [
    `Phase: ${PHASE_TITLES[rec.phaseKey]}`,
    `Framing: ${rec.prompt}`,
    `Recommended option — ${rec.recommended.title}: ${rec.recommended.rationale} (confidence ${rec.recommended.confidence})`,
    `Alternative — ${rec.alternative.title}: ${rec.alternative.rationale} (confidence ${rec.alternative.confidence})`,
  ];

  const userPrompt = [
    "Here is the pending recommendation:",
    ...recapLines.map((l) => `- ${l}`),
    "",
    `The founder's question: ${question}`,
  ].join("\n");

  let answer: string;
  try {
    const result = await callDirectLLM(
      [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
      session.uid,
    );
    answer = result.content;
  } catch (err) {
    if (err instanceof RateLimitExceededError) return rateLimitResponse(err);
    const msg = (err as Error).message ?? "unknown";
    console.error("clarify_call_failed:", msg);
    return NextResponse.json(
      { error: "model_unavailable", detail: msg },
      { status: 502 },
    );
  }

  // Persist: user's question first, then the assistant's answer. Both reference
  // the recommendation message so the UI can group them visually if needed.
  const userMessage: ConversationMessage = await repo.appendMessage({
    userId: session.uid,
    projectId,
    role: "user",
    payload: {
      kind: "clarification_question",
      data: { text: question, recommendationMessageId: messageId },
    },
  });
  const assistantMessage: ConversationMessage = await repo.appendMessage({
    userId: session.uid,
    projectId,
    role: "assistant",
    payload: {
      kind: "clarification_answer",
      data: { text: answer, recommendationMessageId: messageId },
    },
  });

  return NextResponse.json({
    question: userMessage,
    answer: assistantMessage,
  });
}
