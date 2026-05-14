# Branchback

Explore every path. Build the right one.

Branchback helps solo founders turn messy product ideas into clear, build-ready decisions by exploring options in a clean, trackable decision graph.

Branchback is an idea exploration workspace for solo founders and builders. Start with a rough concept, compare different directions, capture key decisions, and keep every branch of your thinking organized as the idea evolves.

Instead of losing context across notes, chats, docs, and half-finished plans, Branchback gives you a structured way to explore possibilities without making a mess. Each recommendation, decision, revision, and tradeoff stays connected, so you can revisit earlier paths, understand why choices were made, and turn the best direction into a focused product brief.

Built for people moving from "I have an idea" to "I know what to build next."

The app features a versioned product decision graph, allowing users to trace and revisit decisions. This app is conversational based: the founder and a strong agent work together to clarify the final product stance and generate handoff docs for architecture, implementation, marketing, legal, and other downstream agents.

This repo currently ships the **vertical slice** described in `docs/PLAN.md` — Idea Intake → orchestrator-driven 9-phase planning conversation → recommendation + decision capture → Product Story compile → branching Reasoning Trail with revisit/switch/re-attach → Product Founder Brief generation. Architecture and naming follow `docs/PLAN.md`; UI follows `docs/Branchback v1.1 — Hi-Fi Print.pdf`.

## Stack

- **Next.js 16 App Router** + React 19 + TypeScript + Turbopack
- **Tailwind v4** + **shadcn/ui** (Base UI primitives) + lucide-react
- **Firebase Auth** (Google sign-in, session cookies)
- **Firestore** via `firebase-admin` for primary storage (default; persists across server restarts). `Repository` interface lets you swap to in-memory for tests or to a Cloud SQL / Data Connect skeleton if FF ever grows into Postgres-shaped problems.
- **Pluggable LLM layer.** Three adapters out of the box: a deterministic **mock** (no network — use this to walk the slice without any keys), an **Ollama** adapter for local models, and an **OpenAI-compatible** adapter you can point at any provider that speaks the OpenAI Chat Completions protocol (OpenAI, DeepSeek, Groq, Together, OpenRouter, Fireworks, Anyscale, Mistral, local vLLM / LM Studio / llama.cpp server, …). Picked at runtime by `ORCHESTRATOR_MODE` / `BRIEF_SYNTHESIS_MODE`, or auto-selected based on whether `LLM_API_KEY` is set.
- Firebase Hosting + Cloud Functions/Cloud Run later (deferred)

## Quick start (no LLM key required)

```bash
pnpm install
cp .env.example .env.local
pnpm dev:all                 # Firebase Auth + Firestore emulators + Next on :3000
```

The defaults in `.env.example` boot the app in **emulator mode** with the **mock orchestrator** — no Firebase project, no LLM key, no network calls. Walk the slice end-to-end and the conversation runs against two scripted turns.

When you're ready for a real LLM, edit `.env.local`:
- Set `ORCHESTRATOR_MODE=ollama` to talk to a local model via Ollama (see [Driving the conversation with a local Ollama model](#driving-the-conversation-with-a-local-ollama-model) below).
- Set `ORCHESTRATOR_MODE=openai` and fill in `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` to talk to any OpenAI-compatible provider (see [Pointing at any OpenAI-compatible provider](#pointing-at-any-openai-compatible-provider) below).
- Leave `ORCHESTRATOR_MODE` unset and just provide `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` — the app defaults to `openai` whenever a key is present.

### Windows note

If `pnpm` is not on your `PATH` but Corepack is available:

```powershell
corepack pnpm install
corepack pnpm emulators      # tab 1: auth + firestore
corepack pnpm dev            # tab 2: Next on :3000
```

`pnpm dev:all` shells out to `pnpm` internally, so on Corepack-only systems run the emulators and the dev server in two PowerShell tabs as above.

### Adding the Data Connect emulator

Only needed for the Cloud SQL skeleton (see [Wiring Data Connect](#wiring-data-connect-documented-postgres-future-migration-target) below):

```bash
pnpm emulators:full          # auth + firestore + dataconnect
```

## Using a real Firebase project instead of the emulators

By default `.env.example` ships `NEXT_PUBLIC_USE_EMULATORS=true` so a fresh clone works with zero Google Cloud setup. To run against a real Firebase project, create one (Auth + Firestore) and fill in the web app config in `.env.local`:

```dotenv
NEXT_PUBLIC_USE_EMULATORS=false
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project-id.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=...
```

These `NEXT_PUBLIC_*` values are the standard Firebase web SDK config — not secrets; they're shipped to every browser that loads the app. Access control is enforced server-side via `firebase-admin` plus default-deny Firestore security rules (`firestore.rules`).

Server routes use `firebase-admin` for session cookies and Firestore writes. For local development against a real project, provide Admin credentials with either `FIREBASE_SERVICE_ACCOUNT_JSON` or `GOOGLE_APPLICATION_CREDENTIALS`. In deployed Google/Firebase infrastructure, Application Default Credentials can provide this automatically.

## Repository modes

`REPOSITORY_MODE` env var picks which storage backend the `getRepository()` factory hands back:

| Mode | What it is | When to use |
|---|---|---|
| `firestore` (default) | `firebase-admin/firestore` against the emulator (or a real Firestore project once you provision one) | Daily dev. Persists across restarts. |
| `memory` | In-process map keyed by `globalThis` | Tests, CI, or the rare cold-start dev session where you don't want to boot the Firestore emulator. State evaporates on every server restart. |
| `dataconnect` | Skeleton against `firebase/data-connect` runtime | Documented Postgres-future migration target. Currently throws `not_yet_implemented` on every method — see "Wiring Data Connect" below. |

## Walking the slice (data persists across restarts on `firestore`)

1. Open <http://localhost:3000>. You'll see the intake screen with a sign-in prompt.
2. Click **Sign in** → **Continue with Google** → pick (or auto-create) a fake account in the Auth emulator picker → land back on `/`.
3. Type a rough idea (e.g. *"An app that helps junior developers prep for senior interviews"*), keep **Deep Planning** selected, click **Start the conversation →**.
4. On the workspace, the mock orchestrator emits the first clarification question after a beat.
5. Type any answer, hit Enter. The recommendation card set appears (RECOMMENDED **Coding career switchers** vs alternative, with actions to confirm either option or keep thinking).
6. Click **Go with coding career switchers** → an acknowledgement bar appears, the **Who it's for** field on the right fills in, and the buttons disable.
7. Click **view reasoning →**. The Reasoning Trail opens as a two-pane view: filterable card list on the left (filter chips: All / You decided / Agent rec / Agent inferred), selected-decision inspector on the right (rationale, confidence, affected areas, alternatives considered).
8. In the inspector, click **Revisit this decision** → modal opens with the original reasoning quoted, red chips for affected areas, and green chips for unaffected confirmed decisions. Click an alternative we already recorded to pre-fill the pivot, edit title/rationale/confidence, then **Pivot to this**. The original decision and any descendants stay active on their own branch; a new sibling decision is created at the same branch point via a `decision_edge` of relationship `follows`, the cursor moves to the new branch, the Product Story is recompiled from the new lineage, and an inline acknowledgement message is appended. To return to the original branch, click any decision on it and choose **Switch to this branch**.
9. The Product Founder Brief renders the project as a "Product Founder Brief" hero (concept name + tagline) with six sections (Who it's for / The problem / Core insight / MVP thesis / Excluded from MVP / Success metrics). Each section that has a confirmed source decision shows the synthesized copy + a `view source` chip linking back to `/trail#decision-id`; undecided sections show italic placeholders. The bottom amber panel lists the open questions per phase with **Resume →** deep links into the workspace.
10. Click **Regenerate** to recompile the brief from the latest decisions (writes a new `generated_briefs` row plus a `brief_compiler` and a `brief_synthesizer` row in `ai_generations`). Click **Copy handoff prompt** to put a markdown handoff snippet on your clipboard.

## Driving the conversation with a local Ollama model

The mock above only knows two scripted turns. To test the full conversational loop with a real LLM running locally:

```bash
# 1. Make sure Ollama is running and the model is pulled.
ollama serve                # in its own tab if not already running
ollama pull gemma4:e2b      # or another small model — see below

# 2. Flip ORCHESTRATOR_MODE in .env.local
ORCHESTRATOR_MODE=ollama
OLLAMA_MODEL=gemma4:e2b     # default; override to use a different model
OLLAMA_BASE_URL=http://127.0.0.1:11434

# 3. Restart `pnpm dev` (env vars are read at module init).
```

Now every `/turn` call goes to your local Ollama server. The orchestrator sends a system prompt describing the 9 phases + the current product story + recent conversation, and asks the model to emit either an `ask_question` or a `recommend_option` action as strict JSON (Ollama structured outputs, validated by Zod). Recommendations still pop into the same `RecommendationCardSet` component; the confirmation buttons still capture decisions; the Reasoning Trail still records every `ai_generations` row with `providerId: 'ollama'` and the actual model id + latency.

Free-text input stays available even when a recommendation is on screen, so you can either click a card or push back conversationally — the LLM sees both the pending recommendation and your reply on the next turn.

If a turn fails (model down, timeout, schema-invalid response after one repair attempt), the orchestrator emits a graceful fallback question and logs the failure to `ai_generations` with `providerCallStatus: 'failed' | 'timeout'`. Adjust `OLLAMA_TIMEOUT_MS` and `OLLAMA_NUM_CTX` in `.env.local` for slower hardware or longer planning sessions.

**Model picks worth trying:**
- `gemma4:e2b` — small Gemma 4 (5B), fast, decent JSON adherence — the default
- `llama3.1:8b` or `qwen2.5:7b` — better reasoning on recommendation rationales, slower
- `qwen2.5:14b-instruct` and up — noticeably better strategic suggestions if you have the RAM

## Pointing at any OpenAI-compatible provider

The `openai` adapter speaks the OpenAI Chat Completions protocol, which most cloud and local providers honor. Point it at any of them with three env vars:

```dotenv
# .env.local
ORCHESTRATOR_MODE=openai
BRIEF_SYNTHESIS_MODE=openai
LLM_API_KEY=...
LLM_BASE_URL=...                  # provider's /v1 root (or equivalent)
LLM_MODEL=...                     # provider's model identifier

# Optional — defaults shown
# LLM_TEMPERATURE=0.4
# LLM_MAX_TOKENS=512
# LLM_TIMEOUT_MS=60000

# Brief-specific overrides (fall back to LLM_* above)
# LLM_BRIEF_MODEL=
# LLM_BRIEF_TEMPERATURE=0.5
# LLM_BRIEF_MAX_TOKENS=768

# Opt-in rate limit (per user, rolling window). 0 = disabled (default).
# LLM_RATE_LIMIT_PER_DAY=100
# LLM_RATE_LIMIT_WINDOW_HOURS=24
```

Common provider configurations (drop any of these into `.env.local`):

| Provider | `LLM_BASE_URL` | Example `LLM_MODEL` |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| Anthropic | `https://api.anthropic.com/v1/` | `claude-sonnet-4-5` |
| DeepSeek | `https://api.deepseek.com` | `deepseek-chat` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.1-70b-versatile` |
| Together | `https://api.together.xyz/v1` | `meta-llama/Llama-3.3-70B-Instruct-Turbo` |
| OpenRouter | `https://openrouter.ai/api/v1` | `anthropic/claude-3.5-sonnet` |
| Fireworks | `https://api.fireworks.ai/inference/v1` | `accounts/fireworks/models/llama-v3p1-70b-instruct` |
| Mistral | `https://api.mistral.ai/v1` | `mistral-large-latest` |
| vLLM (self-host) | `http://localhost:8000/v1` | whatever you served |
| LM Studio | `http://localhost:1234/v1` | whatever you loaded |

The adapter requests `response_format: { type: "json_object" }`. Most OpenAI-compatible providers honor it; for ones that don't (Anthropic's compatibility shim, some self-hosted runtimes), the orchestrator's built-in repair pass and Zod schema validation catch malformed JSON and either retry once or fall back gracefully — so providers without strict JSON mode still work in practice, just with a slightly higher fallback rate.

Note on Anthropic: the URL above is Anthropic's [OpenAI-compatibility endpoint](https://docs.anthropic.com/en/api/openai-sdk), which accepts the OpenAI Chat Completions shape with `Authorization: Bearer <anthropic-api-key>`. It's a translation shim rather than the native Anthropic API, so a few advanced features (strict JSON mode, fine-grained tool-use control) aren't supported — for this app's structured-extraction use case it works fine.

## Letting Ollama write the brief synthesis

The brief compiler is deterministic by default — it maps confirmed decisions into sections and falls back to placeholder copy. To let the LLM rewrite the synthesis pieces (`tagline`, `core_insight`, `mvp_thesis`):

```dotenv
# .env.local
BRIEF_SYNTHESIS_MODE=ollama
# Optional — defaults fall back to OLLAMA_MODEL / OLLAMA_TEMPERATURE
# OLLAMA_BRIEF_MODEL=qwen2.5:7b
# OLLAMA_BRIEF_TEMPERATURE=0.5
```

The synthesizer runs alongside the deterministic compiler — it never invents decisions, it only rewrites the synthesis sections in the founder's voice. A nullable JSON schema lets it return `null` for any section it can't honestly improve, in which case the deterministic copy stands. Every brief generation now logs two `ai_generations` rows: `brief_compiler` (deterministic) + `brief_synthesizer_*` (mock | ollama | openai depending on `BRIEF_SYNTHESIS_MODE`). On any LLM failure (timeout, schema reject, unreachable) the synthesizer logs a `failed`/`rejected` provenance row and the deterministic baseline ships.

## Wiring Data Connect (documented Postgres-future migration target)

The slice currently ships on `REPOSITORY_MODE=firestore`. The Data Connect path remains documented as the migration target if Firestore's denormalization for graph queries (multi-hop lineage, branch traversal, cross-user analytics) becomes painful. To make that swap:

```bash
# 1. From the repo root, scaffold Data Connect against the existing schema.
!  firebase init dataconnect

# 2. Generate the typed JS client (re-run on every schema/operations.gql change).
!  pnpm dataconnect:generate

# 3. For purely local dev, the Data Connect emulator runs PGlite — no Cloud SQL needed:
!  pnpm emulators:full  # auth + firestore + dataconnect emulators

# 4. Flip the env var.
#    REPOSITORY_MODE=dataconnect in .env.local
#    NEXT_PUBLIC_USE_EMULATORS=true
#    DATACONNECT_EMULATOR_HOST=127.0.0.1:18899
```

`src/lib/db/dataconnect/repository.ts` ships as a typed skeleton: every `Repository` method has the right signature and a `notImplemented()` body with inline TODOs showing the intended `executeMutation(mutationRef(dc, "OperationName", { ... }))` call. Each method is a small, isolated unit of work — implement them one at a time against `dataconnect/connector/operations.gql`. You'll need to:

- Verify the operations in `dataconnect/connector/operations.gql` compile against your DC service (`firebase dataconnect:compile`); my version was hand-written and never round-tripped.
- Add operations missing from the slice schema: `InsertGeneratedBrief`, `InsertBriefSection`, `UpdateConversationMessagePayload` (for the recommendation-confirmation flow), `InsertDecisionEdge`, `GetLatestBrief`, `GetDecisionEdges`, `MarkPhaseComplete`.
- Decide on the server-side auth strategy: the JS Data Connect SDK is browser-oriented; on the server you'll need to either mint a custom token via firebase-admin and exchange it, run mutations through a Cloud Function, or move to the gRPC server SDK.

Until those steps are done, `REPOSITORY_MODE=dataconnect` will throw a clear error on the first repository call. Stay on `firestore` (default) for now.

## Project structure

```
src/
  app/
    page.tsx                                         # Idea Intake
    sign-in/page.tsx
    actions.ts                                       # createProjectAction (Server Action)
    api/auth/session/route.ts                        # session cookie exchange
    api/projects/[projectId]/turn/route.ts           # run-orchestrator-turn
    api/projects/[projectId]/decisions/route.ts      # confirm a recommendation
    api/projects/[projectId]/decisions/[decisionId]/revisit/route.ts  # pivot flow (creates a sibling branch)
    api/projects/[projectId]/brief/regenerate/route.ts  # recompile brief
    p/[projectId]/page.tsx                           # workspace
    p/[projectId]/trail/page.tsx                     # Reasoning Trail (two-pane)
    p/[projectId]/brief/page.tsx                     # Product Founder Brief
  components/
    auth/sign-in-button.tsx
    intake/intake-form.tsx
    workspace/                                       # workspace components (Page 2 of mock)
    trail/                                           # decision card list + inspector + revisit modal (Page 4/5)
    brief/brief-actions.tsx                          # brief header actions (regenerate/export/copy)
    ui/                                              # shadcn primitives
  lib/
    firebase/{client,admin,session,session-cookie-name}.ts
    db/{types,repository,memory,index}.ts            # repository abstraction
    db/firestore/{client,converters,repository}.ts   # default backend — firebase-admin/firestore
    db/dataconnect/{client,repository}.ts            # documented Postgres-future skeleton
    utils.ts
  server/
    orchestrator/{types,_shared,mock,ollama,openai,index}.ts     # mock | ollama | openai (any OpenAI-compatible endpoint)
    productStory/compile.ts                                       # decisions → Product Story
    brief/{templates,compile,persist}.ts                          # decisions → Product Founder Brief
    brief/synthesizer/{types,_shared,mock,ollama,openai,index}.ts  # mock | ollama | openai LLM rewrite of synthesis sections
    hashing.ts
  proxy.ts                                           # Next.js 16 proxy (was middleware)
dataconnect/
  schema/schema.gql                                  # 6 @table types for slice subset
  connector/operations.gql                           # typed mutations + queries
  dataconnect.yaml + connector/connector.yaml
firebase.json
docs/
  PLAN.md
  Branchback v1.1 — Hi-Fi Print.pdf
```

## Architecture notes

- **Decision Graph = source of truth.** Every confirmed choice becomes a `decision_node`; `conversation_messages` is the evidence; `product_state_snapshots` is the compiled cache; `ai_generations` is the provenance trail.
- **Repository abstraction is the storage seam.** All app code talks to a single `Repository` interface (`src/lib/db/repository.ts`); the picker (`src/lib/db/index.ts`) hands back `firestore` (default), `memory`, or `dataconnect` based on env. Swapping backends never touches a route or component.
- **Firestore layout** — every project is a root doc with subcollections (`phases`, `messages`, `decisions`, `snapshots`, `generations`, `briefs`, `edges`). `nextTurnIndex` lives on the project root and increments transactionally. Brief sections are inlined as an array on the brief doc (bounded ~6, well under 1MB).
- **Admin SDK bypasses Firestore Security Rules.** All access is server-side via `firebase-admin`. Ownership is enforced in code via `loadOwnedProject(uid, projectId)` on every read AND write. The `firestore.rules` file is default-deny — defense-in-depth for any future client-SDK access.
- **Mock-first, plug in any LLM later.** Orchestrator and Synthesizer are both interfaces with three concrete adapters: mock (no network), Ollama (local models), and an OpenAI-compatible adapter that works with any provider speaking the OpenAI Chat Completions protocol — OpenAI, DeepSeek, Groq, Together, OpenRouter, vLLM, LM Studio, and so on. Pick at runtime via `ORCHESTRATOR_MODE` / `BRIEF_SYNTHESIS_MODE` in `.env.local`. Real Postgres lands later if Firestore's denormalization gets painful — the schema and operations files in `dataconnect/` are the migration target.
- **Auth on Next.js App Router.** Client signs in via `signInWithPopup`, exchanges the ID token for a 5-day `__session` cookie at `POST /api/auth/session` (admin SDK creates it). The proxy (Edge runtime) only checks cookie *presence*; real `verifySessionCookie` happens in Server Components / Route Handlers / Server Actions, which run on Node.

## Out of slice (next plans)

- Brief export to PDF/Markdown (currently `Copy handoff prompt` only)
- Idempotency hardening (every POST already accepts an optional `Idempotency-Key`; not yet enforced)
- Automated test framework — Vitest + MSW recommended given the Repository / Orchestrator / Synthesizer abstractions are now stable seams
