import type { ConversationPayload } from "@/lib/db/types";
import type { OrchestratorAction } from "./types";

// Translate an orchestrator action into the ConversationPayload shape that
// gets persisted. Shared between /turn and /revisit so both routes go through
// the same translation.
export function actionToPayload(action: OrchestratorAction): ConversationPayload {
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
