// Stage 3: constraint validation. Dispatches every entry in
// definition.constraints to its matching validator module (Section 3 of
// constraint-enforcement-spec.md), then applies failure semantics
// (Section 4). An unknown constraint `type` is itself a rejection — this is
// a defensive second line behind the schema's enum (Section 1 item 3): the
// schema catches it at Stage 2 for well-formed JSON, this dispatcher catches
// it for any definition that reaches Stage 3 by other means (e.g. direct
// unit invocation, or a future relaxation of Stage 2).

import type { Registry } from "../registry/registry.js";
import { checkApiStability } from "./modules/api-stability.js";
import { checkComposition } from "./modules/composition.js";
import { checkMutability } from "./modules/mutability.js";
import { checkTokenUsage } from "./modules/token-usage.js";
import type {
  Candidate,
  ComponentDefinition,
  ConstraintEntry,
  ModuleResult,
  RejectionDetail,
  StageResult,
} from "./types.js";

const MODULE = "stage3-constraints";

const KNOWN_TYPES = new Set([
  "token-usage",
  "accessibility",
  "composition",
  "mutability",
  "performance",
  "api-stability",
]);

// Types whose enforcement requires a live rendered tree (Stage 4 / M3).
// They are recognized (not rejected) but deferred with a note.
const DEFERRED_TO_STAGE4 = new Set(["accessibility", "performance"]);

export interface Stage3Outcome {
  stageResult: StageResult;
  rejection?: RejectionDetail;
  warnings: RejectionDetail[];
}

function toRejection(stage: 3, v: { constraintId: string; message: string; sourceSpan: string }): RejectionDetail {
  return { stage, module: MODULE, constraintId: v.constraintId, message: v.message, sourceSpan: v.sourceSpan };
}

function dispatchConstraint(
  definition: ComponentDefinition,
  constraint: ConstraintEntry,
  candidate: Candidate,
  registry: Registry
): ModuleResult {
  switch (constraint.type) {
    case "token-usage":
      return checkTokenUsage(definition, candidate.css, constraint);
    case "api-stability":
      return checkApiStability(definition, constraint, registry);
    case "mutability":
      return checkMutability(definition, constraint, candidate.requestType, registry);
    case "composition":
      return checkComposition(definition, constraint, registry);
    case "accessibility":
    case "performance":
      return { violations: [], notes: [`${constraint.type}: deferred to Stage 4 / M3 (requires rendered instance)`] };
    default:
      // Unreachable for well-typed input; guarded again below for raw/bypassed input.
      return { violations: [], notes: [] };
  }
}

export function runStage3(candidate: Candidate, definition: ComponentDefinition, registry: Registry): Stage3Outcome {
  const notes: string[] = [];
  const warnings: RejectionDetail[] = [];

  for (let i = 0; i < definition.constraints.length; i++) {
    const constraint = definition.constraints[i] as ConstraintEntry;

    if (!KNOWN_TYPES.has(constraint.type)) {
      const rejection: RejectionDetail = {
        stage: 3,
        module: MODULE,
        constraintId: constraint.id ?? null,
        message: `Unknown constraint type "${constraint.type}" at constraints[${i}]. No validator module is registered for it.`,
        sourceSpan: `constraints[${i}].type`,
      };
      return {
        rejection,
        warnings,
        stageResult: { stage: 3, name: MODULE, passed: false, notes: [rejection.message] },
      };
    }

    const result = dispatchConstraint(definition, constraint, candidate, registry);
    notes.push(...result.notes);
    if (DEFERRED_TO_STAGE4.has(constraint.type)) continue;

    for (const violation of result.violations) {
      if (violation.hard || violation.severity === "reject") {
        const rejection = toRejection(3, violation);
        return {
          rejection,
          warnings,
          stageResult: { stage: 3, name: MODULE, passed: false, notes: [...notes, violation.message] },
        };
      }

      // Module-pinned flag (Section 3, e.g. a border-radius literal): takes
      // the flag path even under a constraint that declares reject. Section
      // 4 still applies — every flag enters the review queue with the
      // constraint's rationale on display, and an empty rationale is treated
      // as reject (handled below with declared flags).
      const flagPath = violation.severity === "flag" || constraint.failureBehavior === "flag";

      if (!flagPath && constraint.failureBehavior === "reject") {
        const rejection = toRejection(3, violation);
        return {
          rejection,
          warnings,
          stageResult: { stage: 3, name: MODULE, passed: false, notes: [...notes, violation.message] },
        };
      }

      // Flag path: declared failureBehavior "flag" or module-pinned severity.
      const rationale = constraint.rationale?.trim();
      if (!rationale) {
        // Spec Section 4: "If the rationale is empty, the pipeline treats the constraint as reject."
        const rejection = toRejection(3, {
          ...violation,
          message: `${violation.message} (failureBehavior "flag" but rationale is empty/missing; treated as reject.)`,
        });
        return {
          rejection,
          warnings,
          stageResult: { stage: 3, name: MODULE, passed: false, notes: [...notes, rejection.message] },
        };
      }
      warnings.push(toRejection(3, violation));
    }
  }

  return {
    warnings,
    stageResult: { stage: 3, name: MODULE, passed: true, notes },
  };
}
