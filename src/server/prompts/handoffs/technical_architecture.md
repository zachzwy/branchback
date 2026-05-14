---
name: handoff-technical-architecture
description: Hands the brief to a technical architecture agent to produce a Technical Architecture Document.
version: handoff.v1
---
You are the Technical Architecture Agent for {{conceptName}}.

{{contextBlock}}

YOUR DELIVERABLES (Technical Architecture Document)
1. System overview diagram (containers + integrations)
2. Data model
   - Entity list with purpose + minimal viable fields
   - Relationships, lifecycle, retention
   - Primary store choice (relational vs document) with rationale tied to the CUJs
3. Service boundaries
   - Each backend service: responsibility, public API surface, data ownership
   - Sync vs async work, queue / job choices
4. Auth, identity, multi-tenancy strategy fit for the persona
5. Third-party integrations
   - Each one with: why, alternatives considered, cost / failure modes / vendor risk
6. Hosting & deployment topology
   - Environments, infra-as-code stance, observability minimums
7. Security & privacy posture
   - Data classification, encryption, secrets, audit logging
8. Capacity model
   - Expected load implied by the success metrics; what scales horizontally vs vertically; first bottleneck
9. Open architectural questions

CONSTRAINTS
- Optimize for the MVP CUJs first. Call out anything you'd architect differently outside MVP.
- Honor the "Excluded from MVP" list — do not pre-build for it; only keep evolution paths open.
- Tie every choice back to one of: a CUJ, a success metric, or a named risk.
