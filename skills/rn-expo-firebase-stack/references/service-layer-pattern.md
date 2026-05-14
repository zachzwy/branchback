# Service Layer Pattern

The reference codebase uses a strict three-layer separation. Understanding it is the single highest-leverage thing when replicating this stack.

## The flow

```
Screen Component  (presentation only)
    ↓ calls
Custom Hook       (state + caching + lifecycle)
    ↓ calls
Service           (pure function over Firebase)
    ↓ calls
Firebase / SDK
```

## Layer 1 — Screens (`src/screens/*.tsx`)

- Render UI and wire user gestures to hooks.
- Never import `firebase/*` directly.
- Never call a service directly — always go through a hook.
- Navigation is the only "side effect" they own (`navigation.navigate(...)`).

## Layer 2 — Hooks (`src/hooks/*.ts`)

- One hook per domain concept (`useBabyProgress`, `useTokens`, `useMoments`).
- Own React state, `useEffect` subscriptions, and error-to-state catching.
- For data that must render instantly on cold start, hydrate synchronously from AsyncStorage, then overwrite with realtime data once the Firestore listener fires:

  ```ts
  const [data, setData] = useState<T | null>(() => readCacheSync());
  useEffect(() => {
    const unsubscribe = subscribeToData((fresh) => {
      setData(fresh);
      writeCacheAsync(fresh);
    });
    return unsubscribe;
  }, [childId]);
  ```

- Return `{ data, loading, error, actions... }` — services throw, hooks expose via state.
- Guard writes behind a read-only check when the app supports linked-account caregivers:

  ```ts
  const readOnly = useReadOnlyStatus();
  const save = async (input) => {
    if (readOnly) return;
    await someService.create(input);
  };
  ```

## Layer 3 — Services (`src/services/*.service.ts`)

- Stateless modules. Export named functions, not classes.
- Accept plain IDs + data, return `Promise<T>` or an unsubscribe function for realtime.
- Throw on error — never swallow. The hook catches and surfaces.
- Resolve the active user via a single helper (`getCurrentUser()` / `getDataUserId()`) — never read `auth.currentUser` inline.
- Resolve multi-tenant paths through one function (`getChildBasePath()` in the reference codebase) so switching the active child/owner is a one-line change.

### Typical service shape

```ts
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { getChildBasePath } from './child.service';

export function subscribeToActivities(
  childId: string,
  onChange: (items: Activity[]) => void
): () => void {
  const ref = collection(db, `${getChildBasePath(childId)}/activities`);
  return onSnapshot(ref, (snap) => {
    onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Activity)));
  });
}

export async function createActivity(childId: string, input: ActivityInput): Promise<void> {
  const ref = doc(collection(db, `${getChildBasePath(childId)}/activities`));
  await setDoc(ref, { ...input, createdAt: Date.now() });
}
```

## Firestore data modeling

The reference codebase scopes all per-child data under a single base path:

```
/users/{ownerUid}/children/{childId}/
  activities/{id}
  progress/current          ← single-doc aggregate for fast reads
  milestones/{id}
  quests/{id}
  weeklyStats/{weekStart}
  …
```

Per-user (not per-child) collections sit at the top level of the owner:

```
/users/{ownerUid}/moments/{id}
/users/{ownerUid}/caregivers/{caregiverUid}
/invitations/{code}
```

### Why this shape
- A single "active base path" helper routes every read/write, so multi-child switching is trivial.
- Aggregates (progress, weekly stats) live in single docs for one-round-trip reads.
- Caregiver linking uses a top-level `/invitations/{code}` collection so a caregiver can accept without already knowing the owner's UID.

## State management

- **React Context** for global, lightly-changing state (selected child, active timer).
- **No Redux / Zustand / MobX.** Context + hooks + Firestore listeners are sufficient because the source of truth is the database, not client state.
- **One context per concern.** Mixing unrelated state in one context causes unnecessary re-renders.

## Common pitfalls

- **Importing Firebase from a screen.** Breaks the boundary and makes integration tests impossible to mock cleanly.
- **Forgetting to unsubscribe** in `useEffect` cleanup — memory leaks + ghost writes to unmounted components.
- **Letting services hold state.** Module-level mutable state makes testing unpredictable; if you need shared state, use a context.
- **Inline `auth.currentUser` reads.** Centralize through `getCurrentUser()` so tests can swap the active user.
