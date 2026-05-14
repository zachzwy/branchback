import "server-only";

import type {
  DecisionEdge,
  DecisionNode,
  ProductStoryPayload,
} from "@/lib/db/types";
import { lineageActiveDecisions } from "@/lib/graph/lineage";

const EMPTY: ProductStoryPayload = {
  whoItsFor: null,
  problem: null,
  successLooksLike: null,
  solution: null,
  mvpFocus: null,
  openQuestion: null,
};

// Pure projection from the cursor's branch to the right-hand Product Story
// panel. Every panel field maps to one phase; if no on-branch decision exists
// in that phase the field stays null (so a pivot to an early phase visibly
// clears later fields back to "Deciding…" until they're redecided on the new
// branch).
export function compileProductStory(args: {
  decisions: DecisionNode[];
  edges: DecisionEdge[];
  cursorId: string | null;
}): ProductStoryPayload {
  const next: ProductStoryPayload = { ...EMPTY };
  const onPath = lineageActiveDecisions(args);
  for (const d of onPath) {
    switch (d.phaseKey) {
      case "user_narrowing":
        next.whoItsFor = d.title;
        break;
      case "problem_clarification":
        next.problem = d.title;
        break;
      case "outcome_definition":
        next.successLooksLike = d.title;
        break;
      case "solution_direction":
        next.solution = d.title;
        break;
      case "mvp_scoping":
        next.mvpFocus = d.title;
        break;
      default:
        break;
    }
  }
  return next;
}
