// The pipeline entry point: runPipeline(candidate, registry) -> ValidationRecord.
// Runs Stages 1-5 in order (constraint-enforcement-spec.md Section 1), halting
// on the first rejection. Nothing registers without a passing record.

import type { Registry, RegistryEntry } from "../registry/registry.js";
import type { TokensFile } from "../tokens/types.js";
import { apiSignatureHash, structuralHash } from "./hash.js";
import { readClaimedName, runStage1 } from "./stage1-gatekeeping.js";
import { runStage2 } from "./stage2-schema.js";
import { runStage3 } from "./stage3-constraints.js";
import { runStage4 } from "./stage4-rendered.js";
import type { Candidate, RejectionDetail, StageResult, ValidationRecord } from "./types.js";

function rejectedRecord(
  candidateName: string | null,
  stages: StageResult[],
  rejection: RejectionDetail,
  warnings: RejectionDetail[]
): ValidationRecord {
  return {
    candidateName,
    passed: false,
    outcome: "rejected",
    stages,
    rejection,
    warnings,
    timestamp: new Date().toISOString(),
  };
}

export async function runPipeline(
  candidate: Candidate,
  registry: Registry,
  tokenData?: TokensFile
): Promise<ValidationRecord> {
  const stages: StageResult[] = [];
  const claimedName = readClaimedName(candidate.definition);

  // Stage 1: gatekeeping.
  const stage1 = runStage1(candidate, registry);
  stages.push(stage1.stageResult);
  if (stage1.rejection) {
    return rejectedRecord(claimedName, stages, stage1.rejection, []);
  }

  // Stage 2: schema validation.
  const stage2 = runStage2(candidate.definition);
  stages.push(stage2.stageResult);
  if (stage2.rejection || !stage2.definition) {
    return rejectedRecord(
      claimedName,
      stages,
      stage2.rejection ?? {
        stage: 2,
        module: "stage2-schema",
        constraintId: null,
        message: "Schema validation did not produce a definition.",
        sourceSpan: "(root)",
      },
      []
    );
  }
  const definition = stage2.definition;

  // Provenance defensive check (non-negotiable #5): AI-authored definitions
  // require a non-empty (not whitespace-only) justification. The schema's
  // if/then only enforces *presence* of the field, not non-emptiness — this
  // check does not read the justification's prose, only its length
  // (non-negotiable #6).
  if (definition.provenance.author === "ai") {
    const justification = definition.provenance.justification;
    if (justification === undefined || justification.trim().length === 0) {
      const rejection: RejectionDetail = {
        stage: 2,
        module: "stage2-schema",
        constraintId: null,
        message: `AI-authored definition "${definition.name}" has an empty or whitespace-only justification. A definition that cannot explain itself does not register.`,
        sourceSpan: "provenance.justification",
      };
      stages.push({ stage: 2, name: "provenance-check", passed: false, notes: [rejection.message] });
      return rejectedRecord(claimedName, stages, rejection, []);
    }
  }

  // Stage 3: constraint validation.
  const stage3 = runStage3(candidate, definition, registry);
  stages.push(stage3.stageResult);
  if (stage3.rejection) {
    return rejectedRecord(claimedName, stages, stage3.rejection, stage3.warnings);
  }

  // Stage 4: rendered verification.
  const stage4 = await runStage4(candidate, definition, tokenData);
  stages.push(stage4.stageResult);
  const allWarnings = [...stage3.warnings, ...stage4.warnings];
  if (stage4.rejection) {
    return rejectedRecord(claimedName, stages, stage4.rejection, allWarnings);
  }

  // Stage 5: registration.
  const flagged = allWarnings.length > 0;
  const outcome: ValidationRecord["outcome"] = flagged ? "flagged" : "registered";

  const record: ValidationRecord = {
    candidateName: definition.name,
    passed: true,
    outcome,
    stages,
    warnings: allWarnings,
    timestamp: new Date().toISOString(),
  };

  const entry: RegistryEntry = {
    name: definition.name,
    version: definition.version,
    definition,
    apiSignatureHash: apiSignatureHash(definition.api),
    ...(candidate.template !== undefined ? { structuralHash: structuralHash(candidate.template) } : {}),
    validationRecord: record,
    flagged,
    registeredAt: record.timestamp,
  };
  registry.register(entry);

  return record;
}
