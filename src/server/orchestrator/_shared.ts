import "server-only";

import { z } from "zod";
import { sha256 } from "@/server/hashing";
import {
  PHASE_KEYS,
  PHASE_TITLES,
  type ConversationMessage,
  type ConversationPayload,
} from "@/lib/db/types";
import { renderPrompt } from "@/server/prompts/loader";
import { RateLimitExceededError } from "@/server/rateLimit";
import type {
  Orchestrator,
  OrchestratorAction,
  OrchestratorGenerationMeta,
  OrchestratorTurnInput,
  OrchestratorTurnResult,
} from "./types";

export const FALLBACK_PREFIX = "(Model unavailable";

const RECOMMENDATION_ACTIONS = [
  "go_with_recommended",
  "choose_alternative",
  "not_sure",
] as const;

const PhaseEnum = z.enum(PHASE_KEYS);

const OptionSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .transform((s) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_")),
  title: z.string().min(1).max(120),
  rationale: z.string().min(1).max(500),
  confidence: z.number().min(0).max(1),
});

const ActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ask_question"),
    payload: z.object({
      text: z.string().min(1).max(800),
      phaseKey: PhaseEnum,
    }),
  }),
  z.object({
    type: z.literal("recommend_option"),
    payload: z.object({
      phaseKey: PhaseEnum,
      prompt: z.string().min(1).max(600),
      recommended: OptionSchema,
      alternative: OptionSchema,
    }),
  }),
]);

type RawAction = z.infer<typeof ActionSchema>;

export const RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    type: { type: "string", enum: ["ask_question", "recommend_option"] },
    payload: { type: "object" },
  },
  required: ["type", "payload"],
} as const;

function phaseListing(): string {
  return PHASE_KEYS.map(
    (k, i) => `  ${i + 1}. ${k} — ${PHASE_TITLES[k]}`,
  ).join("\n");
}

function productStoryListing(
  story: OrchestratorTurnInput["productStory"],
): string {
  const fields: [string, string | null][] = [
    ["Who it's for", story.whoItsFor],
    ["The problem", story.problem],
    ["What success looks like", story.successLooksLike],
    ["The solution", story.solution],
    ["MVP CUJ list", story.mvpFocus],
  ];
  const lines = fields.map(
    ([label, value]) => `  - ${label}: ${value ?? "(not yet decided)"}`,
  );
  if (story.openQuestion) {
    lines.push(`  - Open question: ${story.openQuestion.text}`);
  }
  return lines.join("\n");
}

function depthPolicyListing(input: OrchestratorTurnInput): string {
  const policy = input.depthPolicy;
  return [
    `Planning depth: "${input.planningDepth}"`,
    `Phase question budget: ${policy.phaseQuestionCount}/${policy.phaseQuestionBudget} questions used for "${input.currentPhaseKey}"`,
    `Budget status: ${policy.atOrOverBudget ? "at_or_over_budget" : "under_budget"}`,
    `Depth guidance: ${policy.guidance}`,
    "Phase exit criteria:",
    ...policy.exitCriteria.map((criterion) => `  - ${criterion}`),
  ].join("\n");
}

export function buildSystemPrompt(input: OrchestratorTurnInput): {
  rendered: string;
  version: string;
} {
  return renderPrompt("orchestrator/system.md", {
    phaseListing: phaseListing(),
    currentPhaseKey: input.currentPhaseKey,
    currentPhaseTitle: PHASE_TITLES[input.currentPhaseKey],
    depthPolicy: depthPolicyListing(input),
    productStory: productStoryListing(input.productStory),
    phaseKeysCsv: PHASE_KEYS.join(", "),
  });
}

function payloadToTranscriptLine(p: ConversationPayload): {
  role: "user" | "assistant";
  content: string;
} | null {
  switch (p.kind) {
    case "raw_idea":
      return { role: "user", content: `[Initial idea] ${p.data.text}` };
    case "answer":
      if (isRepeatRequest(p.data.text)) return null;
      return { role: "user", content: p.data.text };
    case "question":
      if (p.data.text.startsWith(FALLBACK_PREFIX)) return null;
      if (hasExcessiveRepetition(p.data.text)) return null;
      return { role: "assistant", content: p.data.text };
    case "recommendation": {
      const { prompt, recommended, alternative, confirmedChoiceId } = p.data;
      const tail = confirmedChoiceId
        ? ` (Founder chose: ${
            confirmedChoiceId === recommended.id
              ? recommended.title
              : alternative.title
          }.)`
        : " (Awaiting decision.)";
      return {
        role: "assistant",
        content: `[Recommendation] ${prompt} Recommended: ${recommended.title} — ${recommended.rationale} Alternative: ${alternative.title} — ${alternative.rationale}.${tail}`,
      };
    }
    case "acknowledgement":
      return {
        role: "assistant",
        content: `[Decision noted] ${p.data.text}.`,
      };
    default:
      return null;
  }
}

function buildChatHistory(
  messages: Pick<ConversationMessage, "payload">[],
): { role: "user" | "assistant"; content: string }[] {
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of messages) {
    const line = payloadToTranscriptLine(m.payload);
    if (line) out.push(line);
  }
  return out;
}

function isRepeatRequest(text: string | undefined): boolean {
  return /\b(repeat|say again|last question|previous question)\b/i.test(
    text ?? "",
  );
}

function findLastQuestion(
  messages: Pick<ConversationMessage, "payload">[],
): OrchestratorAction | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const payload = messages[i].payload;
    if (payload.kind !== "question") continue;
    if (payload.data.text.startsWith(FALLBACK_PREFIX)) continue;
    if (hasExcessiveRepetition(payload.data.text)) continue;
    return {
      type: "ask_question",
      payload: {
        phaseKey: payload.data.phaseKey,
        text: payload.data.text,
      },
    };
  }
  return null;
}

function latestFounderSignal(input: OrchestratorTurnInput): string {
  if (input.userMessage?.text) return input.userMessage.text;
  const latest = [...input.recentMessages]
    .reverse()
    .find((m) => m.role === "user" && m.payload.kind === "answer");
  return latest?.payload.kind === "answer" ? latest.payload.data.text : "";
}

function defaultRecommendationFor(
  input: OrchestratorTurnInput,
): OrchestratorAction {
  const phaseTitle = PHASE_TITLES[input.currentPhaseKey];
  const signal = latestFounderSignal(input);
  const signalTail = signal
    ? ` Your latest signal was: "${signal.slice(0, 160)}".`
    : "";

  return {
    type: "recommend_option",
    payload: {
      phaseKey: input.currentPhaseKey,
      prompt: `We have enough signal to make a ${phaseTitle.toLowerCase()} decision and keep momentum.`,
      recommended: {
        id: `${input.currentPhaseKey}_current_direction`,
        title: `Proceed with the current ${phaseTitle.toLowerCase()} direction`,
        rationale: `This keeps the planning flow moving within the selected depth.${signalTail}`,
        confidence: 0.6,
      },
      alternative: {
        id: `${input.currentPhaseKey}_keep_exploring`,
        title: `Keep exploring ${phaseTitle.toLowerCase()}`,
        rationale:
          "This may improve confidence, but it will lengthen the planning session.",
        confidence: 0.4,
      },
      actions: [...RECOMMENDATION_ACTIONS],
    },
  };
}

function defaultActionFor(input: OrchestratorTurnInput): OrchestratorAction {
  if (input.depthPolicy.atOrOverBudget && input.userMessage) {
    return defaultRecommendationFor(input);
  }
  return {
    type: "ask_question",
    payload: {
      phaseKey: input.currentPhaseKey,
      text: "Could you say a bit more about what you have in mind here?",
    },
  };
}

function hasExcessiveRepetition(text: string): boolean {
  const normalized = text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length < 24) return false;

  const counts = new Map<string, number>();
  for (const word of words) {
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  if ([...counts.values()].some((count) => count / words.length > 0.28)) {
    return true;
  }

  for (let size = 2; size <= 5; size += 1) {
    const phrases = new Map<string, number>();
    for (let i = 0; i <= words.length - size; i += 1) {
      const phrase = words.slice(i, i + size).join(" ");
      phrases.set(phrase, (phrases.get(phrase) ?? 0) + 1);
    }
    if ([...phrases.values()].some((count) => count >= 4)) return true;
  }

  return false;
}

function tryParse(content: string):
  | { ok: true; value: RawAction }
  | { ok: false; reason: string } {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(content);
  } catch {
    // Sometimes models still wrap in code fences. Strip them and retry.
    const stripped = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    try {
      parsedJson = JSON.parse(stripped);
    } catch (err) {
      return { ok: false, reason: `json_parse: ${(err as Error).message}` };
    }
  }
  const result = ActionSchema.safeParse(parsedJson);
  if (!result.success) {
    return {
      ok: false,
      reason: `schema: ${result.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".")} ${i.message}`)
        .join("; ")}`,
    };
  }
  return { ok: true, value: result.data };
}

function ensureUsableAction(
  input: OrchestratorTurnInput,
  action: RawAction,
): OrchestratorAction | null {
  if (action.type === "ask_question") {
    if (input.depthPolicy.atOrOverBudget && input.userMessage) {
      return defaultRecommendationFor(input);
    }
    if (hasExcessiveRepetition(action.payload.text)) return null;
    return action;
  }
  // Guarantee the UI actions are present in a fixed order.
  const { recommended, alternative } = action.payload;
  if (recommended.id === alternative.id) {
    alternative.id = `${alternative.id}_alt`;
  }
  return {
    type: "recommend_option",
    payload: {
      phaseKey: action.payload.phaseKey,
      prompt: action.payload.prompt,
      recommended,
      alternative,
      actions: [...RECOMMENDATION_ACTIONS],
    },
  };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatProvider {
  modelId: string;
  providerId: OrchestratorGenerationMeta["providerId"];
  routingPolicy: OrchestratorGenerationMeta["routingPolicy"];
  moduleBase: string;
  call(
    messages: ChatMessage[],
    ctx: { userId: string },
  ): Promise<{ content: string }>;
}

function buildGenMeta(args: {
  input: OrchestratorTurnInput;
  action: OrchestratorAction;
  provider: ChatProvider;
  validatorStatus: OrchestratorGenerationMeta["validatorStatus"];
  providerCallStatus: OrchestratorGenerationMeta["providerCallStatus"];
  moduleSuffix: string;
  latencyMs: number;
  promptVersion: string;
}): OrchestratorGenerationMeta {
  return {
    module: args.moduleSuffix
      ? `${args.provider.moduleBase}_${args.moduleSuffix}`
      : args.provider.moduleBase,
    capabilityTier:
      args.action.type === "recommend_option"
        ? "decision_graph_mutation"
        : "structured_extraction",
    routingPolicy: args.provider.routingPolicy,
    providerId: args.provider.providerId,
    modelId: args.provider.modelId,
    promptVersion: args.promptVersion,
    inputHash: sha256(args.input),
    outputHash: sha256(args.action),
    providerCallStatus: args.providerCallStatus,
    validatorStatus: args.validatorStatus,
    latencyMs: args.latencyMs,
  };
}

export function makeChatOrchestrator(
  buildProvider: () => ChatProvider,
): Orchestrator {
  return {
    async runTurn(
      input: OrchestratorTurnInput,
    ): Promise<OrchestratorTurnResult> {
      const provider = buildProvider();
      const start = Date.now();
      const { rendered: systemPrompt, version: promptVersion } =
        buildSystemPrompt(input);

      if (isRepeatRequest(input.userMessage?.text)) {
        const repeated = findLastQuestion(input.recentMessages);
        if (repeated) {
          return {
            actions: [repeated],
            generation: buildGenMeta({
              input,
              action: repeated,
              provider,
              validatorStatus: "passed",
              providerCallStatus: "success",
              moduleSuffix: "repeat",
              latencyMs: Date.now() - start,
              promptVersion,
            }),
          };
        }
      }

      const history = buildChatHistory(input.recentMessages);
      const turnNudge = input.userMessage
        ? null
        : {
            role: "user" as const,
            content:
              "(Begin the conversation. Open the next phase with a single sharp question — don't summarize what they said, just probe.)",
          };
      const messages: ChatMessage[] = [
        { role: "system", content: systemPrompt },
        ...history,
        ...(turnNudge ? [turnNudge] : []),
      ];

      let action: OrchestratorAction;
      let validatorStatus: OrchestratorGenerationMeta["validatorStatus"];
      let providerCallStatus: OrchestratorGenerationMeta["providerCallStatus"];
      let moduleSuffix = "";

      try {
        const first = await provider.call(messages, { userId: input.userId });
        let parsed = tryParse(first.content);

        if (!parsed.ok) {
          // One repair attempt — feed the validator error back to the model.
          const repair = await provider.call(
            [
              ...messages,
              { role: "assistant", content: first.content },
              {
                role: "user",
                content: `Your previous response could not be parsed (${parsed.reason}). Reply again with ONLY a single JSON object matching the schema. No prose, no code fences.`,
              },
            ],
            { userId: input.userId },
          );
          parsed = tryParse(repair.content);
          if (!parsed.ok) {
            action = defaultActionFor(input);
            validatorStatus = "rejected";
            providerCallStatus = "success";
            moduleSuffix = "fallback";
          } else {
            const repairedAction = ensureUsableAction(input, parsed.value);
            action = repairedAction ?? defaultActionFor(input);
            validatorStatus = repairedAction ? "repaired" : "rejected";
            providerCallStatus = "success";
          }
        } else {
          const parsedAction = ensureUsableAction(input, parsed.value);
          action = parsedAction ?? defaultActionFor(input);
          validatorStatus = parsedAction ? "passed" : "rejected";
          providerCallStatus = "success";
        }
      } catch (err) {
        if (err instanceof RateLimitExceededError) throw err;
        const msg = (err as Error).message ?? "unknown";
        const failed: OrchestratorAction = {
          type: "ask_question",
          payload: {
            phaseKey: input.currentPhaseKey,
            text: "(Model unavailable. Tell me more in the meantime?)",
          },
        };
        const latencyMs = Date.now() - start;
        return {
          actions: [failed],
          generation: buildGenMeta({
            input,
            action: failed,
            provider,
            validatorStatus: "failed",
            providerCallStatus: msg.includes("aborted") ? "timeout" : "failed",
            moduleSuffix: "error",
            latencyMs,
            promptVersion,
          }),
        };
      }

      const latencyMs = Date.now() - start;
      return {
        actions: [action],
        generation: buildGenMeta({
          input,
          action,
          provider,
          validatorStatus,
          providerCallStatus,
          moduleSuffix,
          latencyMs,
          promptVersion,
        }),
      };
    },
  };
}
