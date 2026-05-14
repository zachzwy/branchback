import "server-only";

import type { Repository } from "@/lib/db";
import type { GeneratedBrief, WorkspaceSnapshot } from "@/lib/db/types";
import { sha256 } from "@/server/hashing";
import { compileBrief } from "./compile";
import { compileHandoffPrompts } from "./handoffPrompts";
import {
  decisionRecordsForSynth,
  getBriefSynthesizer,
  type BriefSynthesisOutput,
} from "./synthesizer";
import type { InsertBriefSectionInput } from "@/lib/db/repository";

export async function compileAndPersistBrief(args: {
  repo: Repository;
  userId: string;
  workspace: WorkspaceSnapshot;
  triggeredByDecisionId?: string | null;
}): Promise<GeneratedBrief> {
  const { repo, userId, workspace } = args;
  const project = workspace.project;

  // 1. Deterministic baseline. The compiler walks the cursor's lineage so a
  // brief synthesized after a revisit only includes decisions on the current
  // path.
  const compiled = compileBrief({
    project,
    phases: workspace.phases,
    decisions: workspace.decisions,
    edges: workspace.edges,
    snapshot: workspace.latestSnapshot,
  });

  // 1a. Compiler provenance row.
  await repo.insertAIGeneration({
    userId,
    projectId: project.id,
    module: "brief_compiler",
    capabilityTier: "high_stakes_synthesis",
    routingPolicy: "mock",
    providerId: "mock",
    modelId: "deterministic-brief.v1",
    promptVersion: "brief.v1",
    inputHash: sha256({
      decisions: workspace.decisions.map((d) => d.id),
      snapshot: workspace.latestSnapshot?.id ?? null,
    }),
    outputHash: sha256(compiled),
    providerCallStatus: "success",
    validatorStatus: "passed",
    userVisible: true,
    committedToGraph: false,
    latencyMs: 1,
  });

  // 2. Run synthesizer (mock no-op or LLM rewrite).
  const synth: BriefSynthesisOutput = await getBriefSynthesizer().synthesize({
    userId,
    conceptName: compiled.conceptName,
    tagline: compiled.tagline,
    sections: compiled.sections.map((s) => ({
      key: s.key,
      title: s.title,
      body: s.body,
      bullets: s.bullets,
      isPlaceholder: s.isPlaceholder,
    })),
    decisions: decisionRecordsForSynth(workspace.decisions),
    productStory:
      workspace.latestSnapshot?.payload ?? {
        whoItsFor: null,
        problem: null,
        successLooksLike: null,
        solution: null,
        mvpFocus: null,
        openQuestion: null,
      },
    planningDepth: project.planningDepth,
  });

  // 2a. Synthesizer provenance row.
  await repo.insertAIGeneration({
    userId,
    projectId: project.id,
    module: synth.generation.module,
    capabilityTier: synth.generation.capabilityTier,
    routingPolicy: synth.generation.routingPolicy,
    providerId: synth.generation.providerId,
    modelId: synth.generation.modelId,
    promptVersion: synth.generation.promptVersion,
    inputHash: synth.generation.inputHash,
    outputHash: synth.generation.outputHash,
    providerCallStatus: synth.generation.providerCallStatus,
    validatorStatus: synth.generation.validatorStatus,
    userVisible: true,
    committedToGraph: false,
    latencyMs: synth.generation.latencyMs,
  });

  // 3. Apply overrides on top of the deterministic compilation. Section
  // overrides only replace fields the synthesizer actually returned.
  const finalTagline = synth.tagline ?? compiled.tagline;
  const finalSections: InsertBriefSectionInput[] = compiled.sections.map(
    (s) => {
      const override = synth.sectionOverrides?.[s.key];
      if (!override) return s;
      const body = override.body ?? s.body;
      const bullets = override.bullets ?? s.bullets;
      // Synthesizer-rewritten sections aren't placeholder anymore even if
      // the deterministic version was.
      const wasPlaceholder = s.isPlaceholder;
      const isPlaceholder =
        wasPlaceholder && body === s.body && bullets === s.bullets;
      return { ...s, body, bullets, isPlaceholder };
    },
  );

  // 4. Recompile handoff prompts on top of the post-synthesis sections so
  // any LLM-rewritten tagline / core_insight / mvp_thesis flows into the
  // downstream agent prompts.
  const finalHandoffPrompts = compileHandoffPrompts({
    conceptName: compiled.conceptName,
    tagline: finalTagline,
    sections: finalSections,
    decisions: workspace.decisions,
    snapshot: workspace.latestSnapshot,
  });

  // 5. Persist final brief.
  return repo.insertGeneratedBrief({
    userId,
    projectId: project.id,
    conceptName: compiled.conceptName,
    tagline: finalTagline,
    elevatorPitch: compiled.elevatorPitch,
    sections: finalSections,
    openQuestions: compiled.openQuestions,
    handoffPrompts: finalHandoffPrompts,
    sourceDecisionIds: compiled.sourceDecisionIds,
    triggeredByDecisionId: args.triggeredByDecisionId ?? null,
    decisionCount: compiled.decisionCount,
    phasesCompleted: compiled.phasesCompleted,
    phasesTotal: compiled.phasesTotal,
  });
}
