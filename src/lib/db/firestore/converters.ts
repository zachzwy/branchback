import "server-only";

import type {
  DocumentData,
  FirestoreDataConverter,
  PartialWithFieldValue,
  QueryDocumentSnapshot,
  WithFieldValue,
} from "firebase-admin/firestore";
import type {
  AIGeneration,
  ConversationMessage,
  ConversationPayload,
  DecisionEdge,
  DecisionNode,
  GeneratedBrief,
  PlanningPhase,
  Project,
  ProductStateSnapshot,
} from "@/lib/db/types";

// Firestore stores objects natively; we rely on plain JSON for payload fields
// (ConversationPayload, ProductStoryPayload) — no JSON.stringify at the
// boundary. Timestamps stay as ISO strings to match `string`-typed domain
// types and InMemoryRepository's behavior.

interface RootProject extends Omit<Project, "id"> {
  // Counter used by appendMessage to assign monotonic turnIndex without a
  // scan-and-max read. Owned by the project root doc, mutated transactionally.
  nextTurnIndex: number;
}

function passThrough<T extends DocumentData>(): FirestoreDataConverter<T> {
  return {
    toFirestore(data: WithFieldValue<T> | PartialWithFieldValue<T>) {
      return data as DocumentData;
    },
    fromFirestore(snap: QueryDocumentSnapshot) {
      return snap.data() as T;
    },
  };
}

function withId<T extends { id: string }>(): FirestoreDataConverter<T> {
  return {
    toFirestore(data: WithFieldValue<T> | PartialWithFieldValue<T>) {
      // Drop `id` from the document body — it's the doc key.
      const { id: _id, ...rest } = data as { id?: unknown } & DocumentData;
      void _id;
      return rest as DocumentData;
    },
    fromFirestore(snap: QueryDocumentSnapshot) {
      return { id: snap.id, ...(snap.data() as Omit<T, "id">) } as T;
    },
  };
}

export const projectConverter = withId<Project & { nextTurnIndex: number }>();
export const phaseConverter = withId<PlanningPhase>();
export const messageConverter = withId<ConversationMessage>();
export const decisionConverter = withId<DecisionNode>();
export const snapshotConverter = withId<ProductStateSnapshot>();
export const generationConverter = withId<AIGeneration>();
export const briefConverter = withId<GeneratedBrief>();
export const edgeConverter = withId<DecisionEdge>();

// `passThrough` is exported for cases where we read raw maps (e.g. inside a
// transaction reading the root project doc and inspecting the nextTurnIndex
// counter directly).
export { passThrough };
export type { RootProject };

// Re-export the payload union so the repository file can typecast Firestore
// `kind`/`payload` reads back into discriminated unions.
export type { ConversationPayload };
