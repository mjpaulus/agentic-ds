import { readFileSync } from "node:fs";
import type {
  PrimLeaf,
  PrimTree,
  Resolution,
  TokensFile,
  TypographyComposite,
} from "./types.js";

/**
 * Regex for the defensive string-shorthand form of a composite typography
 * token, e.g.:
 *   "{ family: {prim.type.family.base}, size: {prim.type.size.12}, weight: {prim.type.weight.regular}, lineHeight: {prim.type.lineHeight.base} }"
 * This is the shape of the `type-caption` bug documented in CLAUDE.md's
 * "Known cleanup" section. The spec file itself has been fixed (see the
 * authorized edit to specs/tokens.json), but the parser normalizes this
 * shorthand defensively regardless, per that same section.
 */
const COMPOSITE_SHORTHAND_RE =
  /^\{\s*family:\s*(\{[^}]+\})\s*,\s*size:\s*(\{[^}]+\})\s*,\s*weight:\s*(\{[^}]+\})\s*,\s*lineHeight:\s*(\{[^}]+\})\s*\}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Normalize a single composite-typography value into object form, if it is
 * written as string shorthand. Non-matching values pass through unchanged.
 */
function normalizeCompositeValue(
  value: unknown
): TypographyComposite | unknown {
  if (typeof value === "string") {
    const match = COMPOSITE_SHORTHAND_RE.exec(value.trim());
    if (match) {
      const family = match[1];
      const size = match[2];
      const weight = match[3];
      const lineHeight = match[4];
      if (family === undefined || size === undefined || weight === undefined || lineHeight === undefined) {
        return value;
      }
      return { family, size, weight, lineHeight } satisfies TypographyComposite;
    }
    return value;
  }
  return value;
}

/**
 * Normalize a `resolution` field: if it's a per-context map, normalize each
 * context's value; if it's a single value, normalize it directly.
 */
function normalizeResolution(resolution: unknown): Resolution {
  if (typeof resolution === "string") {
    return normalizeCompositeValue(resolution) as Resolution;
  }
  if (isPlainObject(resolution)) {
    // Could be a single typography composite object ({family,size,weight,lineHeight})
    // or a per-context map. Either way, walk its values and normalize any
    // string-shorthand entries found within.
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(resolution)) {
      out[key] = normalizeCompositeValue(val);
    }
    return out as Resolution;
  }
  return resolution as Resolution;
}

/**
 * Walk the whole `sem` and `ctx` trees, normalizing any composite typography
 * tokens written as string shorthand into object form. Applied defensively
 * regardless of whether the source file has already been fixed.
 */
function normalizeCompositeTokens(data: TokensFile): TokensFile {
  for (const leaf of Object.values(data.sem)) {
    if (leaf.resolution !== undefined) {
      leaf.resolution = normalizeResolution(leaf.resolution);
    }
  }
  for (const ctxLeaves of Object.values(data.ctx)) {
    for (const leaf of Object.values(ctxLeaves)) {
      if (leaf.resolution !== undefined) {
        leaf.resolution = normalizeResolution(leaf.resolution);
      }
    }
  }
  return data;
}

/**
 * Load tokens either from a file path (reads + JSON.parses) or accepts an
 * in-memory object directly (for tests to inject broken data without
 * touching disk). Applies composite-token normalization in both cases.
 */
export function parseTokens(source: string | TokensFile): TokensFile {
  const raw: TokensFile =
    typeof source === "string"
      ? (JSON.parse(readFileSync(source, "utf-8")) as TokensFile)
      : source;
  return normalizeCompositeTokens(raw);
}

const CURLY_REF_RE = /^\{([a-zA-Z0-9_.]+)\}$/;

/** Is this string a `{curly.path}` reference? */
export function isReference(value: unknown): value is string {
  return typeof value === "string" && CURLY_REF_RE.test(value);
}

/** Extract the dotted path from a `{curly.path}` reference string. */
export function referencePath(value: string): string {
  const match = CURLY_REF_RE.exec(value);
  if (!match) {
    throw new Error(`Not a valid reference: "${value}"`);
  }
  return match[1] as string;
}

/**
 * Resolve a dotted path (e.g. "prim.color.blue.600") against the prim tree,
 * returning the literal $value at that leaf. Throws an Error naming the full
 * path if any segment is missing or the terminal node isn't a leaf.
 */
export function resolvePrimPath(prim: PrimTree, path: string): string | number {
  const segments = path.split(".");
  // First segment must be "prim".
  if (segments[0] !== "prim") {
    throw new Error(`Unresolvable reference path "${path}": must start with "prim"`);
  }
  let node: unknown = prim;
  const walked: string[] = ["prim"];
  for (const segment of segments.slice(1)) {
    if (!isPlainObject(node) || !(segment in node)) {
      throw new Error(`Unresolvable reference path "${path}"`);
    }
    node = node[segment];
    walked.push(segment);
  }
  if (!isPlainObject(node) || !("$value" in node)) {
    throw new Error(`Unresolvable reference path "${path}"`);
  }
  const leaf = node as PrimLeaf;
  return leaf.$value;
}

/**
 * Resolve a `{curly.path}` reference string all the way to its literal prim
 * value. Throws an Error naming the full path if unresolvable.
 */
export function resolveReference(prim: PrimTree, ref: string): string | number {
  const path = referencePath(ref);
  return resolvePrimPath(prim, path);
}
