import "server-only";

import type {
  DecisionNode,
  ProductStateSnapshot,
  Project,
} from "@/lib/db/types";

const MAX_TITLE_LENGTH = 72;

function compact(text: string | null | undefined): string | null {
  const value = text?.replace(/\s+/g, " ").trim();
  return value ? value : null;
}

function trimTitle(text: string): string {
  const cleaned = compact(text) ?? "Untitled product";
  if (cleaned.length <= MAX_TITLE_LENGTH) return cleaned;
  return `${cleaned.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}...`;
}

function titleFromDecision(
  decisions: DecisionNode[],
  phaseKey: DecisionNode["phaseKey"],
): string | null {
  return compact(decisions.find((d) => d.phaseKey === phaseKey)?.title);
}

function fallbackFromRawIdea(project: Project): string {
  const firstSentence =
    compact(project.rawIdea.split(/[.!?]\s|\n+/)[0]) ??
    compact(project.name) ??
    "Untitled product";
  return trimTitle(firstSentence);
}

export function summarizeProductTitle(args: {
  project: Project;
  decisions: DecisionNode[];
  snapshot: ProductStateSnapshot | null;
}): string {
  const story = args.snapshot?.payload;
  const solution =
    compact(story?.solution) ??
    titleFromDecision(args.decisions, "solution_direction");
  if (solution) return trimTitle(solution);

  const persona =
    compact(story?.whoItsFor) ??
    titleFromDecision(args.decisions, "user_narrowing");
  const problem =
    compact(story?.problem) ??
    titleFromDecision(args.decisions, "problem_clarification");
  if (persona && problem) {
    return trimTitle(`${problem} for ${persona}`);
  }
  if (problem) return trimTitle(problem);
  if (persona) return trimTitle(`Product plan for ${persona}`);

  return fallbackFromRawIdea(args.project);
}
