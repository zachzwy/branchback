---
name: rn-expo-firebase-stack
description: Architecture blueprint for React Native + Expo + Firebase mobile apps. Covers the service-layer pattern (Screen → Hook → Service → Firebase), React Context state, React Navigation v7, React Native Paper UI, three-tier testing (Jest snapshot + Jest integration with in-memory Firestore + Maestro E2E), offline-first AsyncStorage caching, and Sentry / RevenueCat / i18next / EAS DevOps. Also includes Gemini AI integration and BigQuery analytics patterns. Use when bootstrapping a new Expo + Firebase mobile app, evaluating library choices for an RN project, or replicating this production stack.
---

# React Native + Expo + Firebase Stack

A production-tested architecture for mobile apps that need realtime data, offline-first UX, gamification, IAP, and AI features. Derived from the `babylove-mobile` codebase.

## When to use this skill

Invoke when the user is:
- Starting a new mobile app and considering React Native + Expo
- Choosing between state / navigation / UI / testing libraries for an Expo project
- Auditing an existing RN codebase for gaps vs. a known-good baseline
- Asking "what do I need to wire up Firebase + subscriptions + analytics?"

## Quick-reference stack

| Concern | Choice |
|---|---|
| Framework | React Native `0.81+` on React `19` |
| Toolchain | Expo SDK `54+` (managed), Expo Dev Client, EAS Build |
| Language | TypeScript strict |
| Backend | Firebase (Auth, Firestore, Storage, Functions) |
| Auth providers | Email + Google + Apple |
| State | React Context (no Redux) |
| Local cache | AsyncStorage hydrate → Firestore `onSnapshot` reconcile |
| Navigation | React Navigation v7 (native-stack + bottom-tabs) |
| UI | React Native Paper (Material Design 3) |
| Icons/SVG | `@expo/vector-icons`, `react-native-svg` |
| Testing | Jest snapshot + Jest integration + Maestro E2E |
| Crash reporting | Sentry |
| Monetization | RevenueCat |
| i18n | i18next + react-i18next |
| AI | Gemini API with per-request token/cost tracking |
| Analytics | Firestore events → BigQuery export |
| Push | expo-notifications + smart scheduler |
| Widgets | `@bacons/apple-targets` (iOS) + `react-native-android-widget` |

## The core pattern — Service Layer

```
Screen Component
    ↓ uses
Custom Hook (src/hooks/*.ts)        ← AsyncStorage fast-cache + onSnapshot reconcile
    ↓ wraps
Service (src/services/*.service.ts) ← stateless, throws on error, returns unsubscribe
    ↓ interacts with
Firebase (Auth, Firestore, Storage, Functions)
```

**Rules**:
- Services are stateless modules. They accept IDs + data, throw on error, and return unsubscribe functions for realtime reads.
- Hooks own cached state and reconcile it with realtime listeners. Critical hooks hydrate synchronously from AsyncStorage so the UI renders instantly on cold start.
- Screens never import Firebase directly.
- Writes are gated by a read-only check (e.g., `useReadOnlyStatus()`) when the app supports linked-account caregiver modes.
- Multi-tenancy: resolve the active scope (e.g., child under owner) through a single `getDataUserId()` / `getBasePath()` helper so every read/write routes correctly.

## Progressive disclosure — read the reference files as needed

- `references/framework-stack.md` — full dependency matrix with versions and purpose
- `references/service-layer-pattern.md` — service + hook conventions, error handling, read-only gating
- `references/testing-strategy.md` — three tiers, determinism rules, what to mock at each layer
- `references/offline-and-caching.md` — AsyncStorage hydrate pattern, Firestore offline persistence, sync queue
- `references/devops-and-telemetry.md` — Sentry, RevenueCat, i18next, EAS, push notifications

## Bootstrap checklist for a new project

1. `npx create-expo-app@latest` with the blank TypeScript template.
2. Enable strict mode in `tsconfig.json`. Add `npx tsc --noEmit` to CI.
3. Install Firebase + AsyncStorage + Navigation + Paper + Safe Area (see `references/framework-stack.md` for exact package list).
4. Add `src/` with `services/`, `hooks/`, `contexts/`, `screens/`, `components/`, `data/`, `types/`, `utils/`, `i18n/`, `__tests__/`, `__mocks__/`.
5. Scaffold `src/services/firebase.ts` and enable Firestore offline persistence.
6. Set up Jest with `jest-expo` preset + a `jest.setup.js` that globally mocks Firebase, navigation, and any native purchases/notifications SDKs.
7. Create `src/__tests__/utils/snapshotEnv.ts` (frozen clock, fixed `Math.random`, `cleanTree()` for React 19 Fibers) before writing any snapshot tests.
8. Add Sentry + RevenueCat + i18next as soon as the app has real users in mind — retrofitting is painful.
9. Configure EAS (`eas.json`) and Expo Dev Client for physical-device testing.

## What NOT to do (lessons from the reference codebase)

- Do not mock at the service layer in integration tests — push mocks down to the Firebase SDK boundary. A test that still passes when a service is replaced with `throw new Error('called')` is mocking the wrong layer.
- Do not snapshot-test without `cleanTree()` stripping underscore-prefixed React 19 internals — `pretty-format` will OOM on Fiber back-refs.
- Do not pass a clock timestamp from outside a hook that owns a live interval (e.g., a 60s ticker). It will drift and desync native widgets.
- Do not forget to mirror i18n keys across every language file — missing keys cause render warnings and UI gaps.
- Do not commit Maestro flows that assert on production account state (e.g., "+15 XP"). Always seed the Firebase emulator.
