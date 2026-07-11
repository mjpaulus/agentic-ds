// token-usage constraint module. Rule shape:
//   { "allowedTiers": ["sem", "ctx"], "consumesOnly": true }
// See constraint-enforcement-spec.md Section 3 ("token-usage") and
// CLAUDE.md non-negotiable #1 (the primitive wall is hardcoded and
// unconditional, regardless of failureBehavior).
//
// Exported separately from the dispatch logic per Section 7 of the spec:
// "Runtime token auditing ... shares the token-usage module's parser; the
// module exports it." `extractVarReferences` is that seam.

import type { ComponentDefinition, ConstraintEntry, ModuleResult, ModuleViolation } from "../types.js";

/** var(--token[, fallback]) — robust to fallback values, whitespace, nesting of the fallback's own parens is not supported (CSS var() fallbacks rarely nest). */
const VAR_REF_RE = /var\(\s*(--[a-zA-Z0-9-]+)\s*(?:,[^)]*)?\)/g;

export interface VarReference {
  token: string;
  index: number;
  match: string;
}

/** Extract every `var(--...)` reference from a CSS string, with source position. Shared with the (deferred) runtime auditor. */
export function extractVarReferences(css: string): VarReference[] {
  const refs: VarReference[] = [];
  for (const m of css.matchAll(VAR_REF_RE)) {
    const token = m[1];
    if (token === undefined || m.index === undefined) continue;
    refs.push({ token, index: m.index, match: m[0] });
  }
  return refs;
}

function spanFor(index: number, snippet: string): string {
  return `css:${index}:${snippet}`;
}

const HEX_COLOR_RE = /#[0-9a-fA-F]{3,8}\b/g;
const COLOR_FN_RE = /\b(rgb|rgba|hsl|hsla)\(/g;
const BORDER_RADIUS_PX_RE = /border-radius\s*:\s*[^;]*\d+(?:\.\d+)?px/g;

export function checkTokenUsage(
  definition: ComponentDefinition,
  css: string | undefined,
  constraint: ConstraintEntry
): ModuleResult {
  if (css === undefined) {
    return { violations: [], notes: ["no css artifact; static css checks deferred"] };
  }

  const violations: ModuleViolation[] = [];
  const rule = constraint.rule as { allowedTiers?: string[]; consumesOnly?: boolean };
  const allowedTiers = rule.allowedTiers ?? ["sem", "ctx"];
  const consumesOnly = rule.consumesOnly ?? true;
  const consumes = new Set(definition.tokens.consumes);

  for (const ref of extractVarReferences(css)) {
    // Non-negotiable #1: the primitive wall is hardcoded and unconditional.
    if (ref.token.startsWith("--prim-")) {
      violations.push({
        constraintId: constraint.id,
        message: `Primitive-tier token reference "${ref.token}" is forbidden in generated CSS regardless of failureBehavior. Primitives compile away; they never exist as runtime custom properties.`,
        sourceSpan: spanFor(ref.index, ref.match),
        hard: true,
      });
      continue;
    }

    const tierMatch = allowedTiers.some((tier) => ref.token.startsWith(`--${tier}-`));
    if (!tierMatch) {
      violations.push({
        constraintId: constraint.id,
        message: `Token reference "${ref.token}" does not match allowed tier prefixes [${allowedTiers.map((t) => `--${t}-`).join(", ")}].`,
        sourceSpan: spanFor(ref.index, ref.match),
      });
      continue;
    }

    if (consumesOnly && !consumes.has(ref.token)) {
      violations.push({
        constraintId: constraint.id,
        message: `Token reference "${ref.token}" is not declared in tokens.consumes.`,
        sourceSpan: spanFor(ref.index, ref.match),
      });
    }
  }

  // Section 3 pins the severity of raw-value violations: "a hex color
  // literal in generated CSS is a rejection; a border-radius literal is a
  // flag". These override the constraint's declared failureBehavior.
  for (const m of css.matchAll(HEX_COLOR_RE)) {
    if (m.index === undefined) continue;
    violations.push({
      constraintId: constraint.id,
      message: `Raw hex color literal "${m[0]}" found in generated CSS; colors must flow through tokens.`,
      sourceSpan: spanFor(m.index, m[0]),
      severity: "reject",
    });
  }
  for (const m of css.matchAll(COLOR_FN_RE)) {
    if (m.index === undefined) continue;
    violations.push({
      constraintId: constraint.id,
      message: `Raw color function "${m[0]}...)" found in generated CSS; colors must flow through tokens.`,
      sourceSpan: spanFor(m.index, m[0]),
      severity: "reject",
    });
  }
  for (const m of css.matchAll(BORDER_RADIUS_PX_RE)) {
    if (m.index === undefined) continue;
    violations.push({
      constraintId: constraint.id,
      message: `Raw px literal in "${m[0]}"; border-radius should flow through a token.`,
      sourceSpan: spanFor(m.index, m[0]),
      severity: "flag",
    });
  }

  return { violations, notes: [] };
}
