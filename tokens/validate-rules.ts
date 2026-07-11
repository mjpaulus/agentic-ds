import { isReference, referencePath, resolveReference } from "./parser.js";
import { isPerContextResolution, resolveLiteral } from "./resolve.js";
import type {
  PrimLeaf,
  PrimTree,
  ResolvedContrastPair,
  TierName,
  TierRule,
  TokensFile,
} from "./types.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Completeness: every sem token whose `resolution` is a per-context map must
 * define a value for every context in rules.contexts. Throws an Error whose
 * message names both the token and the missing context (verbatim substrings,
 * relied on by P1a tests).
 */
export function validateCompleteness(data: TokensFile): void {
  const contexts = data.rules.contexts;
  for (const [name, leaf] of Object.entries(data.sem)) {
    if (leaf.resolution === undefined) continue;
    if (!isPerContextResolution(leaf.resolution)) continue;
    const map = leaf.resolution as Record<string, unknown>;
    for (const context of contexts) {
      if (!(context in map) || map[context] === undefined) {
        throw new Error(
          `Token "${name}" is missing resolution for context "${context}"`
        );
      }
    }
  }
}

/**
 * Primitive leaves must be literal values only: no `{curly.path}` reference
 * syntax anywhere in a prim $value.
 */
function validatePrimLiterals(prim: PrimTree): void {
  function walk(node: PrimTree | PrimLeaf, path: string[]): void {
    if (isPlainObject(node) && "$value" in node) {
      const leaf = node as unknown as PrimLeaf;
      if (typeof leaf.$value === "string" && isReference(leaf.$value)) {
        throw new Error(
          `Primitive token "${path.join(".")}" must be a literal value, not a reference: "${leaf.$value}"`
        );
      }
      return;
    }
    if (!isPlainObject(node)) return;
    for (const [key, child] of Object.entries(node)) {
      walk(child as PrimTree | PrimLeaf, [...path, key]);
    }
  }
  walk(prim, ["prim"]);
}

/** Recursively collect every `{curly.path}` reference string within a value. */
function collectReferences(value: unknown): string[] {
  if (isReference(value)) return [value];
  if (isPlainObject(value)) {
    let out: string[] = [];
    for (const v of Object.values(value)) out = out.concat(collectReferences(v));
    return out;
  }
  return [];
}

/**
 * For a given tier's tokens, verify every reference found (a) points at a
 * tier this tier is allowed to reference (rules.tiers[*].mayReference), and
 * (b) actually resolves against the prim tree.
 */
function validateReferencesResolve(
  prim: PrimTree,
  tierName: TierName,
  tierRule: TierRule,
  tokenName: string,
  value: unknown
): void {
  for (const ref of collectReferences(value)) {
    const path = referencePath(ref);
    const refTier = path.split(".")[0] as TierName;
    if (!tierRule.mayReference.includes(refTier)) {
      throw new Error(
        `Token "${tokenName}" (${tierName}) has illegal reference "${ref}": tier "${tierName}" may only reference [${tierRule.mayReference.join(", ")}]`
      );
    }
    // Throws with the full offending path in the message if unresolvable.
    resolveReference(prim, ref);
  }
}

/**
 * Tier reference legality: sem/ctx tokens may only reference prim (per
 * rules.tiers config); prim tokens must be literal leaves.
 */
export function validateTierReferences(data: TokensFile): void {
  const { prim, sem, ctx, rules } = data;
  validatePrimLiterals(prim);

  const semRule = rules.tiers.sem;
  for (const [name, leaf] of Object.entries(sem)) {
    if (leaf.resolution !== undefined) {
      validateReferencesResolve(prim, "sem", semRule, name, leaf.resolution);
    }
  }

  const ctxRule = rules.tiers.ctx;
  for (const [contextName, leaves] of Object.entries(ctx)) {
    for (const [name, leaf] of Object.entries(leaves)) {
      if (leaf.resolution !== undefined) {
        validateReferencesResolve(
          prim,
          "ctx",
          ctxRule,
          `${contextName}.${name}`,
          leaf.resolution
        );
      }
    }
  }
}

/**
 * Resolve `$extensions['ds.contrastPair']` pairs per context, returning
 * plain resolved data. NO WCAG contrast checking here — that is explicitly
 * out of scope for M1 (belongs to the M2+ accessibility validator module).
 */
export function resolveContrastPairs(data: TokensFile): ResolvedContrastPair[] {
  const { prim, sem, rules } = data;
  const results: ResolvedContrastPair[] = [];
  for (const [name, leaf] of Object.entries(sem)) {
    const pairName = leaf.$extensions?.["ds.contrastPair"];
    if (!pairName) continue;
    const pairedLeaf = sem[pairName];
    if (!pairedLeaf) {
      throw new Error(
        `Token "${name}" declares ds.contrastPair "${pairName}" which does not exist in sem tier`
      );
    }
    if (leaf.resolution === undefined || pairedLeaf.resolution === undefined) {
      throw new Error(
        `Token "${name}" or its contrast pair "${pairName}" has no resolution to resolve`
      );
    }
    for (const context of rules.contexts) {
      const tokenValue = resolveLiteral(prim, leaf.resolution, context);
      const pairedTokenValue = resolveLiteral(prim, pairedLeaf.resolution, context);
      results.push({
        token: name,
        pairedToken: pairName,
        context,
        tokenValue: String(tokenValue),
        pairedTokenValue: String(pairedTokenValue),
      });
    }
  }
  return results;
}

export interface ValidationResult {
  contrastPairs: ResolvedContrastPair[];
}

/**
 * Run all M1 validation: completeness, tier-reference legality (including
 * prim literal-only enforcement and reference resolvability), and contrast
 * pair resolution. Throws on the first failure.
 */
export function validateRules(data: TokensFile): ValidationResult {
  validateCompleteness(data);
  validateTierReferences(data);
  const contrastPairs = resolveContrastPairs(data);
  return { contrastPairs };
}
