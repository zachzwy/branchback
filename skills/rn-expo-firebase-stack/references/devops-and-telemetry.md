# DevOps, Telemetry, Monetization, i18n

The non-feature wiring a production mobile app needs. Retrofit is painful — budget the time to install these early.

## Sentry (crash reporting + performance)

Package: `@sentry/react-native`.

- Wrap the app root in `Sentry.wrap(App)`.
- Initialize in a dedicated `src/services/sentry.ts`, called from `App.tsx` before render.
- Tag every event with the current user UID + active child ID so crashes are attributable.
- Disable reporting in dev (`__DEV__`) to keep signal clean.
- Scrub PII in `beforeSend` — never send email, photos, or free-text user content.

## RevenueCat (subscriptions + IAP)

Package: `react-native-purchases`.

- Wrap the SDK in `revenueCat.service.ts`. Hooks (`useSubscription`) read from the service; components read from the hook.
- Mirror entitlement state into a Firestore `subscriptionStatus` doc so server logic (Cloud Functions, backend features) can authorize without hitting RevenueCat.
- Surface a `useFeatureGate()` hook that combines `isPremium`, remaining quota, and token affordability in one check — screens should not know about the three separate sources.
- The reference codebase layers a custom "Milk Token" in-app economy on top, funded by purchases + earned by activity. Tokens live in `/users/{uid}/tokens/current` for fast reads.

## Push notifications

Package: `expo-notifications`.

- Wrap in `notification.service.ts`; schedule via `notificationScheduler.service.ts`.
- Configure Android channels at init (e.g., `feeding-reminders`, `gamification`, `milestone-reminders`, `activity-reminders`, `timer-progress`) — each channel gets its own importance + sound setting.
- Enforce a minimum delay (the reference codebase uses 60s) to avoid spamming users during rapid state changes.
- Route notification taps to specific screens via `data.screen` payloads. Keep the set of allowed screen names small and match exactly against your navigator's route names (case-sensitive).

## i18n (i18next + react-i18next)

- Initialize in `src/i18n/index.ts`; call before `App` renders.
- Files: `src/i18n/en.json`, `src/i18n/zh.json`, etc. Keys must be mirrored exactly across all locales.
- Add a CI check that every key in `en.json` exists in every other locale file.
- For tests, mock `react-i18next` in `src/__mocks__/react-i18next.js` with an identity `t(key) => key` — snapshot tests then assert on translation keys rather than translated strings, which keeps snapshots locale-stable.

## Analytics + AI cost tracking

- One `analytics.service.ts` that writes events to `/users/{uid}/analyticsEvents/{id}`.
- Schedule a BigQuery export from Firestore via the official Firebase extension — no custom pipeline needed.
- For AI (Gemini, etc.), log input/output token counts + estimated cost per request so you can compute cost-per-user and ROI.

## EAS (Expo Application Services)

- `eas.json` defines `development`, `preview`, and `production` profiles.
- `eas build` for native builds; `eas submit` for App Store / Play Store submission.
- Use `expo-dev-client` during development so you can test the real native config (widgets, custom plugins) without full rebuilds.
- OTA updates via `expo-updates` — ship JS/TS fixes without a new store review. Native changes still require a full build.

## Type safety + linting

- TypeScript strict mode always.
- `npx tsc --noEmit` in CI alongside tests.
- Pre-existing type errors should be catalogued (in a comment or `CLAUDE.md`) so contributors know what's legacy vs. new.

## Git + PR workflow (from the reference codebase)

- Merge `origin/main` into every feature branch before starting work — stale branches lead to regressions when features merge out of order.
- Run `npm test` before committing. Fix regressions before pushing.
- Never merge a PR automatically. Wait for the human to manually test on device and explicitly say to merge.
- Keep `CLAUDE.md` / `AGENT.md` current — it's what onboards new contributors (human and AI).

## Native customization

- **Expo config plugins** (`plugins/`): modify `AndroidManifest.xml`, `Info.plist`, native Podfile, etc., at prebuild time.
- **`patch-package`** (`patches/`): pin fixes to `node_modules` packages. Run via `postinstall`. Use sparingly — each patch is maintenance debt.
- **Apple targets** (`@bacons/apple-targets`, `targets/`): add native Swift extensions (widgets, watch apps, share extensions) as a sibling target.
- **Android widgets** (`react-native-android-widget`): build Android widgets in React, without writing Kotlin.
