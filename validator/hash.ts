// Canonical hashing utilities shared by Stage 1 (gatekeeping) and the
// api-stability / mutability modules. Determinism is the entire point: the
// same logical object, serialized with keys in any order, must hash
// identically (P2 hash-determinism test).

import { createHash } from "node:crypto";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Deterministic stable-JSON stringify: object keys sorted recursively, no
 * whitespace. Arrays keep their order (order is meaningful for arrays; only
 * object key order is normalized).
 */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    const body = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",");
    return `{${body}}`;
  }
  return JSON.stringify(value);
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Canonical hash of a component's `api` object. */
export function apiSignatureHash(api: unknown): string {
  return sha256Hex(stableStringify(api));
}

/**
 * Canonical hash of a template source string. M2 normalizes by collapsing
 * whitespace between tags and trimming, then hashes the result. This is a
 * textual normalization, not a true AST hash — the spec's canonical
 * "structural hash" is a template AST hash; that refinement is deferred to
 * M3 once the generator (and therefore a real template AST) exists.
 */
export function structuralHash(templateSource: string): string {
  const normalized = templateSource
    .replace(/>\s+</g, "><")
    .trim()
    .replace(/\s+/g, " ");
  return sha256Hex(normalized);
}
