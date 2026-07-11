// mutability constraint module. Rule shape: { "class": "fixed" | "adaptive" | "generative" }
// See constraint-enforcement-spec.md Section 3 ("mutability") and
// CLAUDE.md non-negotiable #2: AI-authored changes move mutability in the
// conservative direction only (generative -> adaptive -> fixed). Loosening
// requires provenance.author === "human".
//
// Most of the mutability contract is enforced at Stage 1 (structural/API
// hash comparison for adaptive, hard rejection for fixed). This module
// re-asserts inside Stage 3 so a definition cannot (a) declare one
// mutability class while constraining another, or (b) loosen its own class
// on a mutate request without human provenance.

import type { Registry } from "../../registry/registry.js";
import type { ComponentDefinition, ConstraintEntry, ModuleResult, RequestType } from "../types.js";

const CONSERVATISM_ORDER: Record<string, number> = { fixed: 0, adaptive: 1, generative: 2 };

export function checkMutability(
  definition: ComponentDefinition,
  constraint: ConstraintEntry,
  requestType: RequestType,
  registry: Registry
): ModuleResult {
  const rule = constraint.rule as { class?: string };
  const violations: ModuleResult["violations"] = [];

  if (rule.class !== undefined && rule.class !== definition.mutability) {
    violations.push({
      constraintId: constraint.id,
      message: `Definition declares mutability "${definition.mutability}" but its mutability constraint rule.class is "${rule.class}"; a definition cannot claim one class and constrain another.`,
      sourceSpan: "mutability",
    });
  }

  if (requestType === "mutate") {
    const existing = registry.get(definition.name);
    if (existing) {
      const fromOrder = CONSERVATISM_ORDER[existing.definition.mutability];
      const toOrder = CONSERVATISM_ORDER[definition.mutability];
      const isLoosening = fromOrder !== undefined && toOrder !== undefined && toOrder > fromOrder;
      if (isLoosening && definition.provenance.author !== "human") {
        violations.push({
          constraintId: constraint.id,
          message: `Mutation of "${definition.name}" loosens mutability from "${existing.definition.mutability}" to "${definition.mutability}"; loosening requires provenance.author "human" (got "${definition.provenance.author}").`,
          sourceSpan: "provenance.author",
        });
      }
    }
  }

  return { violations, notes: [] };
}
