import "server-only";

import { z } from "zod";
import { sha256 } from "@/server/hashing";
import {
  BRIEF_SECTION_TITLES,
  PHASE_TITLES,
  type BriefSectionKey,
  type DecisionNode,
  type ProductStoryPayload,
} from "@/lib/db/types";
import type { OrchestratorGenerationMeta } from "@/server/orchestrator/types";
import { renderPrompt } from "@/server/prompts/loader";
import { RateLimitExceededError } from "@/server/rateLimit";
import type {
  BriefSynthesisInput,
  BriefSynthesisOutput,
  BriefSynthesizer,
} from "./types";

const ResponseSchema = z.object({
  tagline: z.string().min(1).max(220).nullable().optional(),
  core_insight: z.string().min(1).max(600).nullable().optional(),
  mvp_thesis: z.string().min(1).max(600).nullable().optional(),
});

type Parsed = z.infer<typeof ResponseSchema>;

export const RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    tagline: { type: ["string", "null"] },
    core_insight: { type: ["string", "null"] },
    mvp_thesis: { type: ["string", "null"] },
  },
} as const;

function decisionsList(decisions: BriefSynthesisInput["decisions"]): string {
  if (decisions.length === 0) return "  (none yet)";
  return decisions
    .map(
      (d) =>
        `  - [${PHASE_TITLES[d.phaseKey]}] ${d.title} (conf ${(d.confidence * 100).toFixed(0)}%) — ${d.rationale}`,
    )
    .join("\n");
}

function storyList(story: ProductStoryPayload): string {
  const fields: [string, string | null][] = [
    ["Who it's for", story.whoItsFor],
    ["The problem", story.problem],
    ["What success looks like", story.successLooksLike],
    ["The solution", story.solution],
    ["MVP CUJ list", story.mvpFocus],
  ];
  return fields
    .map(([k, v]) => `  - ${k}: ${v ?? "(not yet)"}`)
    .join("\n");
}

function deterministicSnapshot(input: BriefSynthesisInput): {
  core_insight: string;
  mvp_thesis: string;
} {
  const findKey = (k: BriefSectionKey): string => {
    const s = input.sections.find((x) => x.key === k);
    return s ? `${s.title}: ${s.body}` : `${BRIEF_SECTION_TITLES[k]}: (none)`;
  };
  return {
    core_insight: findKey("core_insight"),
    mvp_thesis: findKey("mvp_thesis"),
  };
}

export function buildPrompt(input: BriefSynthesisInput): {
  rendered: string;
  version: string;
} {
  const det = deterministicSnapshot(input);
  return renderPrompt("synthesizers/brief.md", {
    conceptName: input.conceptName,
    planningDepth: input.planningDepth,
    decisionsList: decisionsList(input.decisions),
    storyList: storyList(input.productStory),
    tagline: input.tagline,
    coreInsight: det.core_insight,
    mvpThesis: det.mvp_thesis,
  });
}

function parseSafely(content: string): Parsed | null {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    const stripped = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    try {
      raw = JSON.parse(stripped);
    } catch {
      return null;
    }
  }
  const result = ResponseSchema.safeParse(raw);
  return result.success ? result.data : null;
}

function buildOverrides(parsed: Parsed): {
  tagline: string | null;
  sectionOverrides: BriefSynthesisOutput["sectionOverrides"];
} {
  const overrides: BriefSynthesisOutput["sectionOverrides"] = {};
  if (parsed.core_insight) overrides.core_insight = { body: parsed.core_insight };
  if (parsed.mvp_thesis) overrides.mvp_thesis = { body: parsed.mvp_thesis };
  return {
    tagline: parsed.tagline ?? null,
    sectionOverrides:
      Object.keys(overrides).length > 0 ? overrides : undefined,
  };
}

export interface SynthProvider {
  modelId: string;
  providerId: OrchestratorGenerationMeta["providerId"];
  routingPolicy: OrchestratorGenerationMeta["routingPolicy"];
  moduleBase: string;
  call(
    prompt: string,
    ctx: { userId: string },
  ): Promise<{ content: string }>;
}

function genMeta(args: {
  provider: SynthProvider;
  input: BriefSynthesisInput;
  output: Pick<BriefSynthesisOutput, "tagline" | "sectionOverrides">;
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
    capabilityTier: "high_stakes_synthesis",
    routingPolicy: args.provider.routingPolicy,
    providerId: args.provider.providerId,
    modelId: args.provider.modelId,
    promptVersion: args.promptVersion,
    inputHash: sha256(args.input),
    outputHash: sha256(args.output),
    providerCallStatus: args.providerCallStatus,
    validatorStatus: args.validatorStatus,
    latencyMs: args.latencyMs,
  };
}

export function makeSynthesizer(
  buildProvider: () => SynthProvider,
): BriefSynthesizer {
  return {
    async synthesize(input: BriefSynthesisInput): Promise<BriefSynthesisOutput> {
      const provider = buildProvider();
      const start = Date.now();
      const { rendered: prompt, version: promptVersion } = buildPrompt(input);

      try {
        const { content } = await provider.call(prompt, {
          userId: input.userId,
        });
        const parsed = parseSafely(content);
        if (!parsed) {
          // Schema fail — keep deterministic output, log as rejected.
          return {
            generation: genMeta({
              provider,
              input,
              output: {},
              validatorStatus: "rejected",
              providerCallStatus: "success",
              moduleSuffix: "fallback",
              latencyMs: Date.now() - start,
              promptVersion,
            }),
          };
        }
        const overrides = buildOverrides(parsed);
        return {
          ...overrides,
          generation: genMeta({
            provider,
            input,
            output: overrides,
            validatorStatus: "passed",
            providerCallStatus: "success",
            moduleSuffix: "",
            latencyMs: Date.now() - start,
            promptVersion,
          }),
        };
      } catch (err) {
        if (err instanceof RateLimitExceededError) throw err;
        const msg = (err as Error).message;
        // LLM unreachable — fall back to deterministic output, record failure.
        return {
          generation: genMeta({
            provider,
            input,
            output: {},
            validatorStatus: "failed",
            providerCallStatus: msg.includes("aborted") ? "timeout" : "failed",
            moduleSuffix: "error",
            latencyMs: Date.now() - start,
            promptVersion,
          }),
        };
      }
    },
  };
}

export function decisionRecordsForSynth(
  decisions: DecisionNode[],
): BriefSynthesisInput["decisions"] {
  return decisions.map((d) => ({
    phaseKey: d.phaseKey,
    title: d.title,
    rationale: d.rationale,
    confidence: d.confidence,
  }));
}
