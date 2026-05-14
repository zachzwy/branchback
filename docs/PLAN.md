# Branchback Implementation Architecture Plan

## Summary

Branchback helps founders turn rough product ideas into build-ready product
plans through structured conversation, captured reasoning, revisit-able
decisions, and generated Product Founder Briefs.

The core architecture is:

```text
Decision Graph = source of truth
Conversation = evidence
Product Story / Product State = compiled cache
Product Founder Brief = rendered artifact
AI Generation = provenance trail
```

## Current Platform

```text
Next.js App Router + React + TypeScript
Firebase Auth
Firestore via firebase-admin
Repository interface for firestore / memory / dataconnect modes
Mock, Ollama, and OpenAI-compatible orchestrator adapters
```

Firestore is the canonical store today. Firebase Data Connect remains a
documented migration target if future query patterns become better suited to a
relational backend.

## Storage

Each project is a root document with these subcollections:

```text
phases
messages
decisions
snapshots
generations
briefs
edges
```

`nextTurnIndex` lives on the project root and increments transactionally.
Brief sections are stored inline on each generated brief document.

## Product Flow

1. User submits a raw idea.
2. The orchestrator asks phase-aware clarification questions.
3. The orchestrator can present a recommendation with one alternative.
4. User confirms a recommendation.
5. The app records a decision node and a lineage edge from the current cursor.
6. Product Story is recompiled from active decisions.
7. The agent drives the next question until planning is complete.
8. The user can revisit any decision to start a new branch from that point.
   The original decision and its descendants stay intact on their own branch
   so the user can switch back at any time.
9. The app generates a Product Founder Brief from the cursor's branch.

## Decision Graph

Decision nodes capture:

```text
phase key
decision type
title
rationale
confidence
who made the decision
alternatives considered
affected areas
source message
AI generation provenance
status
```

Edges capture relationships between decisions:

```text
follows
informs
depends_on
```

The project cursor points at the current decision. New decisions follow the
cursor on the active branch. Revisiting a decision creates a sibling at the
same branch point and moves the cursor onto the new branch — both branches
remain visible and the user can switch back to the original branch at any
time. Phase state is always recomputed from the cursor's lineage.

## Brief Generation

The deterministic brief compiler maps confirmed decisions into:

```text
Who it's for
The problem
Core insight
MVP thesis
Excluded from MVP
Success metrics
```

The optional brief synthesizer can rewrite synthesis fields with an LLM while
preserving the decision graph as the source of truth.

## Out Of Slice

- PDF export
- Idempotency hardening
- Automated test framework
- Production deployment (Firebase Hosting + Cloud Run / Cloud Functions)
