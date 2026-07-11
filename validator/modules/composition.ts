// composition constraint module — static portion only (M2). Rule shape: the
// `composition` object from the definition, plus { "enforceSlotContent": true }.
// See constraint-enforcement-spec.md Section 3 ("composition"). The rendered
// slot-content probe half of this module is Stage 4 / M3 and is NOT
// implemented here.

import type { Registry } from "../../registry/registry.js";
import type { ComponentDefinition, ConstraintEntry, ModuleResult } from "../types.js";

export function checkComposition(
  definition: ComponentDefinition,
  constraint: ConstraintEntry,
  registry: Registry
): ModuleResult {
  const composition = definition.composition;
  if (!composition) {
    return { violations: [], notes: ["no composition block; nothing to check"] };
  }

  const violations: ModuleResult["violations"] = [];

  (composition.allowedChildren ?? []).forEach((name, i) => {
    if (!registry.has(name)) {
      violations.push({
        constraintId: constraint.id,
        message: `composition.allowedChildren references unregistered component "${name}". Composition allowlists are closed-world: every referenced name must already be registered.`,
        sourceSpan: `composition.allowedChildren[${i}]`,
      });
    }
  });

  (composition.allowedParents ?? []).forEach((name, i) => {
    if (!registry.has(name)) {
      violations.push({
        constraintId: constraint.id,
        message: `composition.allowedParents references unregistered component "${name}". Composition allowlists are closed-world: every referenced name must already be registered.`,
        sourceSpan: `composition.allowedParents[${i}]`,
      });
    }
  });

  return {
    violations,
    notes: ["slot-content probes deferred to Stage 4 / M3"],
  };
}
