import "server-only";

import {
  BRIEF_SECTION_KEYS,
  PHASE_TITLES,
  type BriefSectionKey,
  type PhaseKey,
} from "@/lib/db/types";

// Mapping: which planning phase's confirmed decisions populate which brief
// section. Sections without a phase entry rely on multi-decision synthesis
// (handled in compile.ts) — for the slice those degrade to a placeholder.
export const SECTION_PRIMARY_PHASE: Partial<
  Record<BriefSectionKey, PhaseKey>
> = {
  who_its_for: "user_narrowing",
  the_problem: "problem_clarification",
  success_metrics: "outcome_definition",
  mvp_thesis: "mvp_scoping",
};

export const SECTION_PLACEHOLDER: Record<BriefSectionKey, string> = {
  who_its_for:
    "Not yet decided — keep narrowing the persona in User Narrowing.",
  the_problem:
    "Not yet decided — sharpen the problem statement in Problem Clarification.",
  core_insight:
    "Synthesizes from confirmed decisions — capture more before this lands.",
  mvp_thesis:
    "Not yet decided - list the critical MVP user journeys that prove the thesis.",
  excluded_from_mvp:
    "Nothing has been explicitly excluded yet. Cuts surface as the MVP CUJ list is clarified.",
  success_metrics:
    "Not yet decided — define what success looks like in Outcome Definition.",
};

// Per-phase open question shown in the brief footer when the phase has no
// confirmed decision yet. Drives the "Resume →" deep links.
export const PHASE_OPEN_QUESTION: Partial<Record<PhaseKey, string>> = {
  problem_clarification: "What's the strongest version of the problem we're solving?",
  user_narrowing: "Who exactly is the first user we're building for?",
  outcome_definition:
    "What's the clearest signal that this product is working in 90 days?",
  solution_direction:
    "Which solution shape best fits the constraints we've named?",
  mvp_scoping:
    "Which critical user journeys must the MVP cover to genuinely test the thesis?",
  product_loops: "What loop would actually pull users back?",
  risks_assumptions:
    "Which assumption, if wrong, would invalidate the whole thesis?",
};

export const SECTION_ORDER: BriefSectionKey[] = [...BRIEF_SECTION_KEYS];

export function phaseLabel(key: PhaseKey): string {
  return PHASE_TITLES[key];
}
