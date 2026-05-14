import "server-only";

import {
  BRIEF_HANDOFF_KEYS,
  BRIEF_HANDOFF_TITLES,
  PHASE_TITLES,
  type BriefHandoffKey,
  type BriefHandoffPrompt,
  type BriefSectionKey,
  type DecisionNode,
  type ProductStateSnapshot,
} from "@/lib/db/types";
import type { InsertBriefSectionInput } from "@/lib/db/repository";
import { loadPrompt, render } from "@/server/prompts/loader";

const NOT_DECIDED = "(not yet decided)";

interface CompileArgs {
  conceptName: string;
  tagline: string;
  sections: InsertBriefSectionInput[];
  decisions: DecisionNode[];
  snapshot: ProductStateSnapshot | null;
}

interface BriefContext {
  conceptName: string;
  tagline: string;
  whoItsFor: string;
  problem: string;
  insight: string;
  solution: string;
  successMetrics: string;
  cujList: string[];
  excludedItems: string[];
  risks: string[];
  openQuestions: string[];
}

function findSection(
  sections: InsertBriefSectionInput[],
  key: BriefSectionKey,
): InsertBriefSectionInput | undefined {
  return sections.find((s) => s.key === key);
}

function sectionBody(
  sections: InsertBriefSectionInput[],
  key: BriefSectionKey,
): string {
  const s = findSection(sections, key);
  if (!s || s.isPlaceholder) return NOT_DECIDED;
  return s.body;
}

function decisionsByPhase(
  decisions: DecisionNode[],
  phaseKey: DecisionNode["phaseKey"],
): DecisionNode[] {
  return decisions.filter((d) => d.phaseKey === phaseKey);
}

function buildCujList(
  sections: InsertBriefSectionInput[],
  decisions: DecisionNode[],
): string[] {
  const mvp = findSection(sections, "mvp_thesis");
  const fromBullets = mvp && !mvp.isPlaceholder ? [...mvp.bullets] : [];
  if (mvp && !mvp.isPlaceholder) {
    fromBullets.unshift(mvp.body);
  }
  if (fromBullets.length > 0) return fromBullets;
  const phaseDecisions = decisionsByPhase(decisions, "mvp_scoping");
  if (phaseDecisions.length > 0) {
    return phaseDecisions.map((d) => `${d.title} — ${d.rationale}`);
  }
  return [];
}

function buildExcluded(sections: InsertBriefSectionInput[]): string[] {
  const s = findSection(sections, "excluded_from_mvp");
  if (!s || s.isPlaceholder) return [];
  return s.bullets.length > 0 ? s.bullets : [s.body];
}

function buildRisks(decisions: DecisionNode[]): string[] {
  return decisionsByPhase(decisions, "risks_assumptions").map(
    (d) => `${d.title} — ${d.rationale}`,
  );
}

function buildOpenQuestions(snapshot: ProductStateSnapshot | null): string[] {
  const q = snapshot?.payload.openQuestion;
  if (!q) return [];
  return [`[${PHASE_TITLES[q.phaseKey]}] ${q.text}`];
}

function bulletList(items: string[], indent = "  "): string {
  if (items.length === 0) return `${indent}- (none captured yet)`;
  return items.map((i) => `${indent}- ${i}`).join("\n");
}

function buildContext(args: CompileArgs): BriefContext {
  const story = args.snapshot?.payload;
  return {
    conceptName: args.conceptName,
    tagline: args.tagline,
    whoItsFor: story?.whoItsFor ?? sectionBody(args.sections, "who_its_for"),
    problem: story?.problem ?? sectionBody(args.sections, "the_problem"),
    insight: sectionBody(args.sections, "core_insight"),
    solution: story?.solution ?? "(solution direction not yet locked)",
    successMetrics:
      story?.successLooksLike ?? sectionBody(args.sections, "success_metrics"),
    cujList: buildCujList(args.sections, args.decisions),
    excludedItems: buildExcluded(args.sections),
    risks: buildRisks(args.decisions),
    openQuestions: buildOpenQuestions(args.snapshot),
  };
}

function contextBlock(ctx: BriefContext): string {
  return [
    "CONTEXT FROM PRODUCT FOUNDER BRIEF",
    `- Concept: ${ctx.conceptName}`,
    `- Tagline: ${ctx.tagline}`,
    `- Who it's for: ${ctx.whoItsFor}`,
    `- The problem: ${ctx.problem}`,
    `- Core insight: ${ctx.insight}`,
    `- Solution direction: ${ctx.solution}`,
    `- Success metrics: ${ctx.successMetrics}`,
    "- MVP critical user journeys:",
    bulletList(ctx.cujList),
    "- Explicitly excluded from MVP:",
    bulletList(ctx.excludedItems),
    "- Known risks / assumptions:",
    bulletList(ctx.risks),
    "- Open questions still on the table:",
    bulletList(ctx.openQuestions),
  ].join("\n");
}

const HANDOFF_FILES: Record<BriefHandoffKey, string> = {
  design: "handoffs/design.md",
  technical_architecture: "handoffs/technical_architecture.md",
  implementation: "handoffs/implementation.md",
  qa: "handoffs/qa.md",
  marketing: "handoffs/marketing.md",
  financial: "handoffs/financial.md",
  legal: "handoffs/legal.md",
  customer_success: "handoffs/customer_success.md",
};

export function compileHandoffPrompts(args: CompileArgs): BriefHandoffPrompt[] {
  const ctx = buildContext(args);
  const block = contextBlock(ctx);
  return BRIEF_HANDOFF_KEYS.map((key) => {
    const prompt = loadPrompt(HANDOFF_FILES[key]);
    return {
      key,
      title: BRIEF_HANDOFF_TITLES[key],
      description: prompt.description,
      prompt: render(prompt.body, {
        conceptName: ctx.conceptName,
        contextBlock: block,
      }),
    };
  });
}
