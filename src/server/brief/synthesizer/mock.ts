import "server-only";

import { sha256 } from "@/server/hashing";
import type { BriefSynthesizer, BriefSynthesisInput, BriefSynthesisOutput } from "./types";

// Mock synthesizer: returns no overrides. The deterministic compiler output
// is what the user sees. Provenance row still gets written so the audit trail
// records that synthesis happened (even if it's a no-op).
export class MockBriefSynthesizer implements BriefSynthesizer {
  async synthesize(input: BriefSynthesisInput): Promise<BriefSynthesisOutput> {
    return {
      generation: {
        module: "brief_synthesizer",
        capabilityTier: "high_stakes_synthesis",
        routingPolicy: "mock",
        providerId: "mock",
        modelId: "deterministic-brief.v1",
        promptVersion: "brief.synth.v1",
        inputHash: sha256(input),
        outputHash: sha256(null),
        providerCallStatus: "success",
        validatorStatus: "passed",
        latencyMs: 1,
      },
    };
  }
}
