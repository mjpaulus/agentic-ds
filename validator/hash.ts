// Canonical hashing utilities shared by Stage 1 (gatekeeping) and the
// api-stability / mutability modules. Determinism is the entire point: the
// same logical object, serialized with keys in any order, must hash
// identically (P2 hash-determinism test).

import { createHash } from "node:crypto";
import { Window } from "happy-dom";

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
 * Canonical serialization of one DOM node for the M3 template-AST hash:
 * lowercased tag names, attributes sorted by name, text nodes trimmed and
 * whitespace-collapsed (empty text nodes drop out entirely — inter-tag
 * whitespace carries no structural meaning), comments dropped. `<template>`
 * elements are walked via their `.content` fragment since their direct
 * children live there, not on the element itself.
 */
function canonicalSerializeNode(node: unknown): string {
  const n = node as {
    nodeType: number;
    tagName?: string;
    textContent?: string;
    attributes?: ArrayLike<{ name: string; value: string }>;
    childNodes?: ArrayLike<unknown>;
    content?: { childNodes: ArrayLike<unknown> };
  };

  // Text node.
  if (n.nodeType === 3) {
    const text = (n.textContent ?? "").trim().replace(/\s+/g, " ");
    return text.length > 0 ? JSON.stringify(text) : "";
  }

  // Comment node (dropped) or anything else non-element.
  if (n.nodeType !== 1) return "";

  const tag = (n.tagName ?? "").toLowerCase();
  const attrs = Array.from(n.attributes ?? [])
    .map((a) => ({ name: a.name, value: a.value }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((a) => `${a.name}=${JSON.stringify(a.value)}`)
    .join(" ");

  const childSource = tag === "template" && n.content ? n.content.childNodes : n.childNodes ?? [];
  const children = Array.from(childSource)
    .map((c) => canonicalSerializeNode(c))
    .filter((s) => s.length > 0)
    .join("");

  return `<${tag}${attrs ? ` ${attrs}` : ""}>${children}</${tag}>`;
}

/**
 * Canonical hash of a template source string: a true template-AST hash
 * (CLAUDE.md M3 note), not a textual normalization. Parses `templateSource`
 * with happy-dom, walks the resulting tree, and hashes a canonical
 * serialization (lowercased tags, sorted attributes, collapsed/trimmed text,
 * dropped comments). Byte-different but structurally identical templates
 * (attribute order swapped, whitespace differences) hash identically; a real
 * structural change (added element or attribute) changes the hash.
 */
export function structuralHash(templateSource: string): string {
  const window = new Window();
  const document = window.document as unknown as { body: { innerHTML: string; childNodes: ArrayLike<unknown> } };
  document.body.innerHTML = templateSource;
  const serialized = Array.from(document.body.childNodes)
    .map((c) => canonicalSerializeNode(c))
    .filter((s) => s.length > 0)
    .join("");
  return sha256Hex(serialized);
}
