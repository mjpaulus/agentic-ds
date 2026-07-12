// Node-side convenience wiring for the evolution gate: `revalidateViaPipeline`
// is the concrete `RevalidateFn` (telemetry/evolution.ts) used everywhere
// outside the browser (tests, the demo-data build step). It runs Stages 2-4
// of the real pipeline — Stage 1 (gatekeeping) is deliberately SKIPPED:
// promotion is not a mutation request against the registry, it is
// re-checking an already-registered definition's variant against the
// CURRENT tokens/constraints (constraint-enforcement-spec.md Section 5).
// Stage 1's rules are about identity and mutability-class gatekeeping for
// incoming candidates, neither of which applies to a definition the registry
// already holds. This file is intentionally the only place that imports both
// the (browser-pure) telemetry types and the (node-only) generator/pipeline
// stages, keeping gate.ts and evolution.ts free of node imports.

import type { Registry } from "../registry/registry.js";
import { generateComponent } from "../generator/generate.js";
import { runStage3 } from "../validator/stage3-constraints.js";
import { runStage4 } from "../validator/stage4-rendered.js";
import { runStage2 } from "../validator/stage2-schema.js";
import type { Candidate, ComponentDefinition, RejectionDetail, StageResult, ValidationRecord } from "../validator/types.js";
import type { RevalidateFn } from "./evolution.js";

function rejectedRecord(candidateName: string | null, stages: StageResult[], rejection: RejectionDetail): ValidationRecord {
  return {
    candidateName,
    passed: false,
    outcome: "rejected",
    stages,
    rejection,
    warnings: [],
    timestamp: new Date().toISOString(),
  };
}

/**
 * Re-run Stages 2-4 of the pipeline against `definition` (an already-
 * registered variant's definition), regenerating its component source fresh
 * from the CURRENT generator/tokens rather than reusing any cached artifact
 * — this is the entire point of revalidation-before-promotion.
 */
export async function revalidateViaPipeline(definition: ComponentDefinition, registry: Registry): Promise<ValidationRecord> {
  const stages: StageResult[] = [];

  const stage2 = runStage2(definition);
  stages.push(stage2.stageResult);
  if (stage2.rejection || !stage2.definition) {
    return rejectedRecord(
      definition.name,
      stages,
      stage2.rejection ?? {
        stage: 2,
        module: "stage2-schema",
        constraintId: null,
        message: "Revalidation: schema validation did not produce a definition.",
        sourceSpan: "(root)",
      }
    );
  }
  const validated = stage2.definition;

  const generated = generateComponent(validated);
  const candidate: Candidate = {
    definition: validated,
    requestType: "register",
    css: generated.css,
    template: generated.template,
    source: generated.source,
  };

  const stage3 = runStage3(candidate, validated, registry);
  stages.push(stage3.stageResult);
  if (stage3.rejection) {
    return rejectedRecord(validated.name, stages, stage3.rejection);
  }

  const stage4 = await runStage4(candidate, validated);
  stages.push(stage4.stageResult);
  const warnings = [...stage3.warnings, ...stage4.warnings];
  if (stage4.rejection) {
    return rejectedRecord(validated.name, stages, stage4.rejection);
  }

  return {
    candidateName: validated.name,
    passed: true,
    outcome: warnings.length > 0 ? "flagged" : "registered",
    stages,
    warnings,
    timestamp: new Date().toISOString(),
  };
}

/** Bind a Registry so the resulting function matches evolution.ts's `RevalidateFn` shape exactly. */
export function revalidatorFor(registry: Registry): RevalidateFn {
  return (definition: ComponentDefinition) => revalidateViaPipeline(definition, registry);
}
