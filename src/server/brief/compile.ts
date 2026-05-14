import "server-only";

import {
  BRIEF_SECTION_TITLES,
  PHASE_KEYS,
  PHASE_TITLES,
  type BriefHandoffPrompt,
  type BriefOpenQuestion,
  type BriefSectionKey,
  type DecisionEdge,
  type DecisionNode,
  type GeneratedBrief,
  type PhaseKey,
  type PlanningPhase,
  type ProductStateSnapshot,
  type Project,
} from "@/lib/db/types";
import type { InsertBriefSectionInput } from "@/lib/db/repository";
import { lineageActiveDecisions } from "@/lib/graph/lineage";
import { summarizeProductTitle } from "@/server/productSummary";
import { compileHandoffPrompts } from "./handoffPrompts";
import {
  PHASE_OPEN_QUESTION,
  SECTION_ORDER,
  SECTION_PLACEHOLDER,
  SECTION_PRIMARY_PHASE,
} from "./templates";

export interface CompiledBrief {
  conceptName: string;
  tagline: string;
  elevatorPitch: string;
  sections: InsertBriefSectionInput[];
  openQuestions: BriefOpenQuestion[];
  handoffPrompts: BriefHandoffPrompt[];
  sourceDecisionIds: string[];
  decisionCount: number;
  phasesCompleted: number;
  phasesTotal: number;
}


function decisionsByPhase(
  decisions: DecisionNode[],
): Map<PhaseKey, DecisionNode[]> {
  const map = new Map<PhaseKey, DecisionNode[]>();
  for (const d of decisions) {
    const list = map.get(d.phaseKey) ?? [];
    list.push(d);
    map.set(d.phaseKey, list);
  }
  return map;
}

function compileTagline(
  decisions: DecisionNode[],
  snapshot: ProductStateSnapshot | null,
): string {
  const story = snapshot?.payload;
  const persona = story?.whoItsFor ?? findTitleByPhase(decisions, "user_narrowing");
  const problem =
    story?.problem ?? findTitleByPhase(decisions, "problem_clarification");
  if (persona && problem) {
    return `For ${persona.toLowerCase()} struggling with ${problem.toLowerCase()}.`;
  }
  if (persona) return `Built for ${persona.toLowerCase()}.`;
  if (problem) return `Aimed at ${problem.toLowerCase()}.`;
  return "Compiled from your reasoning trail. Keep the conversation going to sharpen this.";
}

function compileElevatorPitch(
  decisions: DecisionNode[],
  snapshot: ProductStateSnapshot | null,
): string {
  const story = snapshot?.payload;
  const persona = story?.whoItsFor ?? findTitleByPhase(decisions, "user_narrowing");
  const problem =
    story?.problem ?? findTitleByPhase(decisions, "problem_clarification");
  const solution =
    story?.solution ?? findTitleByPhase(decisions, "solution_direction");
  const outcome =
    story?.successLooksLike ?? findTitleByPhase(decisions, "outcome_definition");
  const mvp = story?.mvpFocus ?? findTitleByPhase(decisions, "mvp_scoping");
  const insight = compileCoreInsight(decisions).body;
  const hasInsight = insight !== SECTION_PLACEHOLDER.core_insight;

  const sentences: string[] = [];

  if (persona && problem && solution) {
    sentences.push(
      `This product helps ${persona.toLowerCase()} solve ${problem.toLowerCase()} through ${solution.toLowerCase()}.`,
    );
  } else if (persona && problem) {
    sentences.push(
      `This product is for ${persona.toLowerCase()} who need a better way through ${problem.toLowerCase()}.`,
    );
  } else if (persona) {
    sentences.push(`This product is built for ${persona.toLowerCase()}.`);
  } else if (problem) {
    sentences.push(`This product focuses on ${problem.toLowerCase()}.`);
  }

  if (hasInsight) {
    sentences.push(insight);
  }
  if (mvp) {
    sentences.push(`The MVP centers on ${mvp.toLowerCase()}.`);
  }
  if (outcome) {
    sentences.push(`Success is measured by ${outcome.toLowerCase()}.`);
  }

  if (sentences.length > 0) return sentences.join(" ");

  return "A fuller pitch will emerge once the target user, problem, solution direction, MVP scope, and success metrics are confirmed.";
}

function findTitleByPhase(
  decisions: DecisionNode[],
  phase: PhaseKey,
): string | null {
  const match = decisions.find((d) => d.phaseKey === phase);
  return match?.title ?? null;
}

function compileBodyForPrimary(
  key: BriefSectionKey,
  phaseDecisions: DecisionNode[],
): { body: string; bullets: string[]; sourceDecisionIds: string[] } {
  if (phaseDecisions.length === 0) {
    return {
      body: SECTION_PLACEHOLDER[key],
      bullets: [],
      sourceDecisionIds: [],
    };
  }
  const primary = phaseDecisions[0];
  const others = phaseDecisions.slice(1);
  const bullets = others.map((d) => d.title);
  return {
    body: `${primary.title}. ${primary.rationale}`,
    bullets,
    sourceDecisionIds: phaseDecisions.map((d) => d.id),
  };
}

function compileCoreInsight(decisions: DecisionNode[]): {
  body: string;
  bullets: string[];
  sourceDecisionIds: string[];
} {
  const persona = decisions.find((d) => d.phaseKey === "user_narrowing");
  const problem = decisions.find((d) => d.phaseKey === "problem_clarification");
  const outcome = decisions.find((d) => d.phaseKey === "outcome_definition");
  const sourceIds: string[] = [];
  const fragments: string[] = [];
  if (persona) {
    fragments.push(`The win sits with ${persona.title.toLowerCase()}`);
    sourceIds.push(persona.id);
  }
  if (problem) {
    fragments.push(`whose ${problem.title.toLowerCase()} is the friction worth solving`);
    sourceIds.push(problem.id);
  }
  if (outcome) {
    fragments.push(
      `and the unit of success is ${outcome.title.toLowerCase()} — not engagement, not growth`,
    );
    sourceIds.push(outcome.id);
  }
  if (fragments.length === 0) {
    return {
      body: SECTION_PLACEHOLDER.core_insight,
      bullets: [],
      sourceDecisionIds: [],
    };
  }
  return {
    body: `${fragments.join(", ")}.`,
    bullets: [],
    sourceDecisionIds: sourceIds,
  };
}

function compileExcluded(decisions: DecisionNode[]): {
  body: string;
  bullets: string[];
  sourceDecisionIds: string[];
} {
  // Slice: aggregate the rejected alternatives from every decision into a
  // "what we explicitly chose against" list, dedup'd by alt title (case-
  // insensitive) so two decisions rejecting the same option don't duplicate.
  // Once an `excluded_from_mvp` decision type lands, prefer those.
  const seen = new Map<string, { title: string; rationale: string; sourceIds: Set<string> }>();
  for (const d of decisions) {
    for (const alt of d.alternatives) {
      const key = alt.title.trim().toLowerCase();
      if (!key) continue;
      const existing = seen.get(key);
      if (existing) {
        existing.sourceIds.add(d.id);
      } else {
        seen.set(key, {
          title: alt.title,
          rationale: alt.rationale,
          sourceIds: new Set([d.id]),
        });
      }
    }
  }
  if (seen.size === 0) {
    return {
      body: SECTION_PLACEHOLDER.excluded_from_mvp,
      bullets: [],
      sourceDecisionIds: [],
    };
  }
  const bullets: string[] = [];
  const allSourceIds = new Set<string>();
  for (const entry of seen.values()) {
    const bullet = entry.rationale
      ? `${entry.title} — ${entry.rationale}`
      : entry.title;
    bullets.push(bullet);
    entry.sourceIds.forEach((id) => allSourceIds.add(id));
  }
  return {
    body: "Explicitly chosen against during planning:",
    bullets,
    sourceDecisionIds: Array.from(allSourceIds),
  };
}

function compileOpenQuestions(
  phases: PlanningPhase[],
  decisions: DecisionNode[],
  snapshot: ProductStateSnapshot | null,
): BriefOpenQuestion[] {
  const decidedPhases = new Set(decisions.map((d) => d.phaseKey));
  const out: BriefOpenQuestion[] = [];

  // 1. Surface the snapshot's open question first, if any.
  if (snapshot?.payload.openQuestion) {
    out.push({
      text: snapshot.payload.openQuestion.text,
      phaseKey: snapshot.payload.openQuestion.phaseKey,
      phaseTitle: PHASE_TITLES[snapshot.payload.openQuestion.phaseKey],
    });
  }

  // 2. Add per-phase templated questions for any non-final phase that hasn't
  // been decided yet — keeps the brief honest about what's still loose.
  for (const phase of phases) {
    if (phase.key === "idea_intake" || phase.key === "final_brief") continue;
    if (decidedPhases.has(phase.key)) continue;
    const text = PHASE_OPEN_QUESTION[phase.key];
    if (!text) continue;
    if (out.some((q) => q.phaseKey === phase.key)) continue;
    out.push({ text, phaseKey: phase.key, phaseTitle: phase.title });
  }

  return out;
}

export function compileBrief(args: {
  project: Project;
  phases: PlanningPhase[];
  decisions: DecisionNode[];
  edges: DecisionEdge[];
  snapshot: ProductStateSnapshot | null;
  triggeredByDecisionId?: string | null;
}): CompiledBrief {
  const decisions = lineageActiveDecisions({
    decisions: args.decisions,
    edges: args.edges,
    cursorId: args.project.currentDecisionId,
  });
  const byPhase = decisionsByPhase(decisions);
  const allSourceIds = new Set<string>();

  const sections: InsertBriefSectionInput[] = SECTION_ORDER.map(
    (key, ordinal) => {
      const title = BRIEF_SECTION_TITLES[key];
      let body: string;
      let bullets: string[];
      let sourceIds: string[];

      if (key === "core_insight") {
        ({
          body,
          bullets,
          sourceDecisionIds: sourceIds,
        } = compileCoreInsight(decisions));
      } else if (key === "excluded_from_mvp") {
        ({
          body,
          bullets,
          sourceDecisionIds: sourceIds,
        } = compileExcluded(decisions));
      } else {
        const primaryPhase = SECTION_PRIMARY_PHASE[key];
        const phaseDecisions = primaryPhase ? (byPhase.get(primaryPhase) ?? []) : [];
        ({
          body,
          bullets,
          sourceDecisionIds: sourceIds,
        } = compileBodyForPrimary(key, phaseDecisions));
      }

      sourceIds.forEach((id) => allSourceIds.add(id));
      return {
        ordinal,
        key,
        title,
        body,
        bullets,
        sourceDecisionIds: sourceIds,
        isPlaceholder: sourceIds.length === 0,
      };
    },
  );

  const phasesCompleted = args.phases.filter(
    (p) => p.status === "complete",
  ).length;

  const conceptName = summarizeProductTitle({
    project: args.project,
    decisions,
    snapshot: args.snapshot,
  });
  const tagline = compileTagline(decisions, args.snapshot);
  const elevatorPitch = compileElevatorPitch(decisions, args.snapshot);

  return {
    conceptName,
    tagline,
    elevatorPitch,
    sections,
    openQuestions: compileOpenQuestions(args.phases, decisions, args.snapshot),
    handoffPrompts: compileHandoffPrompts({
      conceptName,
      tagline,
      sections,
      decisions,
      snapshot: args.snapshot,
    }),
    sourceDecisionIds: Array.from(allSourceIds),
    decisionCount: decisions.length,
    phasesCompleted,
    phasesTotal: PHASE_KEYS.length,
  };
}

export function isBriefStale(
  brief: GeneratedBrief,
  decisions: DecisionNode[],
  edges: DecisionEdge[],
  cursorId: string | null,
): boolean {
  const active = lineageActiveDecisions({ decisions, edges, cursorId });
  if (active.length !== brief.decisionCount) return true;
  const knownIds = new Set(brief.sourceDecisionIds);
  return active.some(
    (d) => !knownIds.has(d.id) && SECTION_PRIMARY_PHASE_VALUES.has(d.phaseKey),
  );
}

const SECTION_PRIMARY_PHASE_VALUES = new Set<PhaseKey>(
  Object.values(SECTION_PRIMARY_PHASE).filter(
    (p): p is PhaseKey => Boolean(p),
  ),
);
