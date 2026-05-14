import type { ConversationMessage } from "@/lib/db/types";
import { AcknowledgementBar } from "./acknowledgement-bar";
import { FallbackQuestion } from "./fallback-question";
import {
  AgentLabel,
  AssistantBubble,
  UserBubble,
} from "./message-bubbles";
import { RecommendationCardSet } from "./recommendation-card-set";

// Keep in sync with FALLBACK_PREFIX in src/server/orchestrator/_shared.ts.
// We hardcode it on the client because _shared.ts is server-only and can't
// be imported into a "use client" tree.
const FALLBACK_PREFIX = "(Model unavailable";

interface Props {
  projectId: string;
  message: ConversationMessage;
  isLast: boolean;
}

export function ConversationMessageItem({ projectId, message, isLast }: Props) {
  switch (message.payload.kind) {
    case "raw_idea":
      return <UserBubble>{message.payload.data.text}</UserBubble>;

    case "answer":
      return <UserBubble>{message.payload.data.text}</UserBubble>;

    case "question": {
      const text = message.payload.data.text;
      if (text.startsWith(FALLBACK_PREFIX)) {
        return (
          <>
            <AgentLabel />
            <FallbackQuestion
              projectId={projectId}
              text={text}
              canRetry={isLast}
            />
          </>
        );
      }
      return (
        <>
          <AgentLabel />
          <AssistantBubble>{text}</AssistantBubble>
        </>
      );
    }

    case "recommendation": {
      const data = message.payload.data;
      return (
        <>
          <AgentLabel />
          <RecommendationCardSet
            projectId={projectId}
            messageId={message.id}
            payload={data}
            alreadyConfirmed={!!data.confirmedChoiceId}
          />
        </>
      );
    }

    case "acknowledgement":
      return (
        <AcknowledgementBar
          projectId={projectId}
          payload={message.payload.data}
        />
      );

    case "clarification_question":
      return <UserBubble>{message.payload.data.text}</UserBubble>;

    case "clarification_answer":
      return (
        <>
          <AgentLabel />
          <AssistantBubble>{message.payload.data.text}</AssistantBubble>
        </>
      );

    default:
      return null;
  }
}
