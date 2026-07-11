// api-stability constraint module. Rule shape: { "signatureHash": "<registry>" }
// See constraint-enforcement-spec.md Section 3 ("api-stability").

import type { Registry } from "../../registry/registry.js";
import { apiSignatureHash } from "../hash.js";
import type { ApiProperty, ComponentDefinition, ConstraintEntry, ModuleResult } from "../types.js";

const REGISTRY_SENTINEL = "<registry>";

export function checkApiStability(
  definition: ComponentDefinition,
  constraint: ConstraintEntry,
  registry: Registry
): ModuleResult {
  const rule = constraint.rule as { signatureHash?: string };
  const declared = rule.signatureHash;
  const computed = apiSignatureHash(definition.api);

  let expected: string | undefined;
  if (declared === REGISTRY_SENTINEL || declared === undefined) {
    const existing = registry.get(definition.name);
    if (!existing) {
      // Nothing to drift from yet — first registration establishes the hash.
      return { violations: [], notes: [`api-stability: "${definition.name}" not yet registered; hash ${computed} will be stored on registration`] };
    }
    expected = existing.apiSignatureHash;
  } else {
    expected = declared;
  }

  if (computed !== expected) {
    return {
      violations: [
        {
          constraintId: constraint.id,
          message: `API signature hash mismatch for "${definition.name}": computed ${computed}, expected ${expected}.`,
          sourceSpan: "api",
        },
      ],
      notes: [],
    };
  }

  return { violations: [], notes: [`api-stability: signature hash ${computed} matches expected`] };
}

/**
 * Validate generated usage (composition inside molecules/organisms) of a
 * component's properties against its declared type + enum. Used by
 * composition checking from M3 onward; unit-tested now against ds-button's
 * `variant` enum.
 */
export function validateUsage(
  definition: ComponentDefinition,
  usageProps: Record<string, unknown>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const byName = new Map<string, ApiProperty>(definition.api.properties.map((p) => [p.name, p]));

  for (const [propName, value] of Object.entries(usageProps)) {
    const spec = byName.get(propName);
    if (!spec) {
      errors.push(`Unknown property "${propName}" for component "${definition.name}".`);
      continue;
    }
    if (typeof value !== spec.type) {
      errors.push(`Property "${propName}" expects type "${spec.type}", got "${typeof value}".`);
      continue;
    }
    if (spec.enum && !spec.enum.includes(value)) {
      errors.push(`Property "${propName}" value ${JSON.stringify(value)} is outside allowed enum [${spec.enum.map((v) => JSON.stringify(v)).join(", ")}].`);
    }
  }

  for (const spec of definition.api.properties) {
    if (spec.required && !(spec.name in usageProps)) {
      errors.push(`Missing required property "${spec.name}" for component "${definition.name}".`);
    }
  }

  return { valid: errors.length === 0, errors };
}
