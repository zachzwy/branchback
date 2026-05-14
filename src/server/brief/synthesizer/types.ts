import type {
  BriefSectionKey,
  DecisionNode,
  PlanningDepth,
  ProductStoryPayload,
} from "@/lib/db/types";
import type { OrchestratorGenerationMeta } from "@/server/orchestrator/types";

export interface BriefSynthesisInput {
  userId: string;
  conceptName: string;
  tagline: string;
  sections: Array<{
    key: BriefSectionKey;
    title: string;
    body: string;
    bullets: string[];
    isPlaceholder: boolean;
  }>;
  decisions: Pick<
    DecisionNode,
    "phaseKey" | "title" | "rationale" | "confidence"
  >[];
  productStory: ProductStoryPayload;
  planningDepth: PlanningDepth;
}

export interface BriefSynthesisOutput {
  // Each field is optional. Null means the synthesizer chose not to rewrite.
  // The compiler keeps the deterministic value when a field is absent or null.
  tagline?: string | null;
  sectionOverrides?: Partial<
    Record<BriefSectionKey, { body?: string | null; bullets?: string[] | null }>
  >;
  generation: OrchestratorGenerationMeta;
}

export interface BriefSynthesizer {
  synthesize(input: BriefSynthesisInput): Promise<BriefSynthesisOutput>;
}
