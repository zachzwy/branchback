import type { ConversationMessage } from "@/lib/db/types";
import { AcknowledgementBar } from "./acknowledgement-bar";
import {
  AgentLabel,
  AssistantBubble,
  UserBubble,
} from "./message-bubbles";
import { RecommendationCardSet } from "./recommendation-card-set";

interface Props {
  projectId: string;
  message: ConversationMessage;
}

export function ConversationMessageItem({ projectId, message }: Props) {
  switch (message.payload.kind) {
    case "raw_idea":
      return <UserBubble>{message.payload.data.text}</UserBubble>;

    case "answer":
      return <UserBubble>{message.payload.data.text}</UserBubble>;

    case "question":
      return (
        <>
          <AgentLabel />
          <AssistantBubble>{message.payload.data.text}</AssistantBubble>
        </>
      );

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

    default:
      return null;
  }
}
