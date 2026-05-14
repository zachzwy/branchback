# Testing Strategy — Three Tiers

Each tier covers a different kind of regression. Treat the boundaries as strict: a snapshot test should not assert behavior, an integration test should not mock a service, an E2E flow should not assert on live production state.

## Tier 1 — Snapshot regression (Jest + jest-expo)

**Scope.** Deterministic render-tree diff of the highest-risk screens and every variant of a form component.

**File convention.** `*.snap.test.tsx` under `src/__tests__/`.

**Run.**
```bash
npm run test:snap          # verify
npm run test:snap:update   # refresh baselines (only after intentional UI change)
```

**Determinism helper** — `src/__tests__/utils/snapshotEnv.ts` must freeze every nondeterministic input:
- Frozen clock (`jest.useFakeTimers({ now: new Date('2026-04-15T12:00:00Z') })`).
- Fixed `Math.random` to a constant.
- Mock `NativeAnimatedHelper` to avoid animation timing drift.
- Provide a `cleanTree(tree)` that recursively strips every underscore-prefixed key (`_owner`, `_debugOwner`, `_reactInternals`, etc.) from `tree.toJSON()`. **Without this, React 19's Fiber back-refs cause `pretty-format` to OOM and inject non-deterministic timing fields.**

**Mock fixtures.** One `mock<Screen>Deps.ts` per screen, plus a shared `mockFormDeps.ts` for forms that mocks `useFormTimer`, unit contexts, timer context, auth/storage services, `react-native-paper`, and `DateTimePicker`.

**Review rule.** Any `.snap` diff must land in the same PR as an intentional UI change. A stray `.snap` diff is almost always drift — reject it.

## Tier 2 — Integration (Jest + @testing-library/react-native)

**Scope.** A real screen rendered with real hooks and real services, with mocks only at the SDK boundary.

**File convention.** `src/__tests__/integration/*.int.test.tsx`.

**What to mock.** Only `firebase/firestore`, `firebase/functions`, `firebase/storage`, `react-native-purchases`, and `expo-image-picker`. Everything above (services, hooks, components) runs for real.

**Foundation files:**
- `integrationEnv.ts` — In-memory Firestore store + `httpsCallable` router + frozen clock. Imported BEFORE the system-under-test so `jest.mock` is hoisted ahead of any `firebase/firestore` import in the dependency tree.
- `canonicalSeed.ts` — A known-good app state ("Maya" baby, a week of activities, level 4 / 250 XP / streak 7). All tests start from this seed and mutate from it.

**Run.**
```bash
npm run test:e2e    # alias for jest --testPathPattern=integration
```

**The boundary rule.** If you add `throw new Error('called')` inside a service and the test still passes, the test is mocking the wrong layer. Push the mock down to the SDK.

## Tier 3 — Maestro device E2E

**Scope.** Real app on simulator/device, exercising full user journeys (auth → onboarding → log → milestone → celebrate).

**File convention.** `.maestro/*.yaml`.

**Install.** Not on npm — `curl -Ls "https://get.maestro.mobile.dev" | bash`.

**Run.**
```bash
npm run test:maestro
```

**Environment.**
- Credentials live in `.maestro/.env` (gitignored; copy from `.maestro/.env.example`).
- Flows must point at the **Firebase emulator**, seeded via `npx tsx .maestro/seed/seed.ts`.
- Never assert against prod state (e.g., "+15 XP") — values drift with the real account and will flake.
- Every literal string used in a flow must match `src/i18n/en.json` exactly; Maestro is case-sensitive.

**Cadence.** Slow (minutes per run). Pre-release smoke only, not every commit.

## Global Jest setup (`jest.setup.js`)

Stub modules that would otherwise hit native code or the network. At minimum:
- `@react-native-async-storage/async-storage` (via its mock entry-point)
- `firebase/*` (each service that the app touches)
- `react-native-purchases`
- `@react-navigation/native`
- `react-i18next` (usually via a local `__mocks__/react-i18next.js` returning identity `t`)
- `ThemeContext` or equivalent app-level providers
- `expo-notifications`, `expo-image-picker`, and other native modules the hook tree imports

## Jest config essentials

```json
{
  "preset": "jest-expo",
  "roots": ["<rootDir>/src"],
  "setupFiles": ["<rootDir>/jest.setup.js"],
  "testMatch": ["**/src/__tests__/**/*.test.(ts|tsx)"],
  "transformIgnorePatterns": [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|firebase|@firebase|i18next|react-i18next|@firebase/util)"
  ],
  "moduleNameMapper": {
    "^@react-native-async-storage/async-storage$": "@react-native-async-storage/async-storage/jest/async-storage-mock",
    "^react-i18next$": "<rootDir>/src/__mocks__/react-i18next.js"
  },
  "testTimeout": 30000
}
```

The `transformIgnorePatterns` allow-list is the usual source of confusing "Unexpected token" errors — add new ESM-only packages to it.

## Type checking as a test

Run `npx tsc --noEmit` in CI alongside Jest. Strict mode catches an entire class of runtime bugs before any test runs.
