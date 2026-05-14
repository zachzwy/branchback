# Offline-First + Caching

Mobile users open the app in elevators, subways, and airplane mode. The reference codebase ships two layers of defense: Firestore's own offline persistence, plus a bespoke AsyncStorage cache for the hottest read paths.

## Layer 1 — Firestore offline persistence

Enable once in `src/services/firebase.ts`:

```ts
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
```

Firestore then:
- Serves cached reads when offline.
- Queues writes locally and flushes them when connectivity returns.
- Keeps `onSnapshot` listeners working from the local cache.

This alone covers most offline UX, but cold-start renders still pay the cost of waiting for the listener to fire before any data is available.

## Layer 2 — AsyncStorage fast-cache for hot paths

For data that drives the first paint (XP/level, token balance, active quests), hydrate synchronously from AsyncStorage so the UI has something to render instantly.

### Pattern

```ts
export function useBabyProgress(childId: string) {
  const [progress, setProgress] = useState<Progress | null>(() => readCacheSync(childId));

  useEffect(() => {
    const unsubscribe = subscribeToProgress(childId, (fresh) => {
      setProgress(fresh);
      writeCacheAsync(childId, fresh);
    });
    return unsubscribe;
  }, [childId]);

  return progress;
}
```

### Cache keys

Namespace by child + concept: `@progress:{childId}`, `@tokens:{childId}`, `@quests:{childId}:{YYYY-MM-DD}`. Never collide across children.

### Invalidation

- Overwrite on every fresh realtime value.
- Clear on sign-out (`AsyncStorage.multiRemove([...])`).
- Version the keys (`@progress:v2:{childId}`) so a shape change rotates the cache without a migration.

## Layer 3 — Sync queue for failed writes

When a write fails (e.g., user toggled airplane mode mid-request), the reference codebase doesn't rely solely on Firestore's queue. It maintains its own queue in AsyncStorage via `sync.service.ts`:

- Enqueue the operation with its payload and a monotonic timestamp.
- On `NetInfo` "connected" event, drain the queue in order.
- Last-write-wins conflict resolution on the server side.
- Max 3 retries per operation, then surface to the user.

Use this pattern when you need stronger guarantees than Firestore's built-in queue offers (e.g., operations that touch Cloud Functions, Storage, and Firestore in sequence).

## Cold-start render order

The app should be able to paint meaningful UI in this order:

1. **T+0ms** — React mounts. Screens read from AsyncStorage synchronously and render skeleton values (level, tokens, last activity time).
2. **T+~50ms** — Firestore listeners attach; offline-cached docs fire immediately if present.
3. **T+~300ms (if online)** — Fresh server values arrive and overwrite the cached state.

Avoid any loading spinner that blocks first paint on these hot-path screens.

## Widget sync (iOS/Android home screen)

Native widgets can't read AsyncStorage. The reference codebase writes a JSON snapshot to a shared container via `react-native-widget-center` whenever `resolvedTiles` changes, and the native widgets (Swift + Android widget task) read from there. Time-ago values are recomputed inside the native widget code so they stay accurate when the app is closed.

**Gotcha:** the hook that owns a live 60-second ticker must use its own internal clock. Passing a `now` timestamp in as a prop will drift and desync the widget from the in-app card.

## Network status

```ts
import NetInfo from '@react-native-community/netinfo';
```

Subscribe once at the app level, expose via context or a `useNetworkStatus()` hook, and use it to:
- Render an "offline" banner.
- Disable actions that genuinely require network (e.g., AI chat).
- Trigger the sync queue drain on reconnect.
