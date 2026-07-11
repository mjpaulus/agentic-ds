import { isReference, resolveReference } from "./parser.js";
import type {
  PerContextResolution,
  PrimTree,
  Resolution,
  TokenReference,
  TypographyComposite,
} from "./types.js";

const COMPOSITE_KEYS = ["family", "size", "weight", "lineHeight"] as const;

/** True if `value` is a single typography composite object (not a per-context map). */
export function isTypographyCompositeShape(
  value: unknown
): value is TypographyComposite {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const keys = Object.keys(value).sort();
  const expected = [...COMPOSITE_KEYS].sort();
  return keys.length === expected.length && keys.every((k, i) => k === expected[i]);
}

/**
 * True if a leaf's `resolution` value is a per-context map (keyed by context
 * name) rather than a single value or single composite object.
 */
export function isPerContextResolution(resolution: Resolution): resolution is PerContextResolution {
  if (typeof resolution === "string") return false;
  if (isTypographyCompositeShape(resolution)) return false;
  return typeof resolution === "object" && resolution !== null;
}

/** Pick the value that applies for a given context from a `resolution` field. */
export function pickResolutionForContext(
  resolution: Resolution,
  context: string
): TokenReference | TypographyComposite {
  if (!isPerContextResolution(resolution)) {
    return resolution as TokenReference | TypographyComposite;
  }
  const picked = resolution[context];
  if (picked === undefined) {
    throw new Error(`No resolution for context "${context}"`);
  }
  return picked;
}

export interface ResolvedTypography {
  family: string | number;
  size: string | number;
  weight: string | number;
  lineHeight: string | number;
}

/**
 * Resolve a `resolution` field down to its literal value(s) for a given
 * context: a single literal for simple tokens, or a {family,size,weight,
 * lineHeight} literal object for composite typography tokens.
 */
export function resolveLiteral(
  prim: PrimTree,
  resolution: Resolution,
  context: string
): string | number | ResolvedTypography {
  const picked = pickResolutionForContext(resolution, context);
  if (typeof picked === "string") {
    if (!isReference(picked)) {
      // Defensive: treat non-reference strings as already-literal.
      return picked;
    }
    return resolveReference(prim, picked);
  }
  return {
    family: resolveReference(prim, picked.family),
    size: resolveReference(prim, picked.size),
    weight: resolveReference(prim, picked.weight),
    lineHeight: resolveReference(prim, picked.lineHeight),
  };
}
