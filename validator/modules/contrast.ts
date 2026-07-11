// Contrast math for the Stage 4 accessibility module. LOCKED DECISION
// (CLAUDE.md M3 task): contrast is token-data math, not rendering — WCAG 2.1
// relative-luminance contrast ratio computed directly from resolved token
// literals, never from a rendered getComputedStyle() read. For every sem
// token with $extensions['ds.contrastPair'] that the definition CONSUMES
// (either side of the pair), resolve both tokens per context and require AA
// (4.5:1, applied uniformly to normal and large text for this POC — a
// documented simplification; real WCAG 2.1 AA allows 3:1 for large text).

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseTokens } from "../../tokens/parser.js";
import { resolveLiteral } from "../../tokens/resolve.js";
import type { TokensFile } from "../../tokens/types.js";
import type { ComponentDefinition } from "../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKENS_PATH = resolve(__dirname, "../../specs/tokens.json");

let cachedRealTokens: TokensFile | undefined;

/** The real parsed tokens.json, cached. Default injectable param for checkContrastPairs. */
export function loadRealTokens(): TokensFile {
  if (!cachedRealTokens) cachedRealTokens = parseTokens(TOKENS_PATH);
  return cachedRealTokens;
}

function hexToRgb(hex: string): [number, number, number] | undefined {
  const clean = hex.trim().replace(/^#/, "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return undefined;
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function srgbChannelToLinear(c: number): number {
  const cs = c / 255;
  return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}

function relativeLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb;
  return 0.2126 * srgbChannelToLinear(r) + 0.7152 * srgbChannelToLinear(g) + 0.0722 * srgbChannelToLinear(b);
}

/** WCAG 2.1 contrast ratio between two hex colors. Returns undefined if either isn't a parseable hex color. */
export function contrastRatio(hexA: string, hexB: string): number | undefined {
  const rgbA = hexToRgb(hexA);
  const rgbB = hexToRgb(hexB);
  if (!rgbA || !rgbB) return undefined;
  const lA = relativeLuminance(rgbA);
  const lB = relativeLuminance(rgbB);
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG 2.1 AA threshold, applied uniformly (POC simplification — see module header). */
export const AA_CONTRAST_MIN = 4.5;

export interface ContrastViolation {
  context: string;
  token: string;
  pairedToken: string;
  ratio: number;
}

export interface ContrastCheckResult {
  violations: ContrastViolation[];
  pairsChecked: number;
}

/**
 * Check every declared ds.contrastPair in `tokenData.sem` that the
 * definition consumes (on either side), across `contexts`, against AA.
 * `tokenData` defaults to the real tokens.json but is injectable so tests
 * (notably the contrast-failure-one-context adversarial fixture) can supply
 * a synthetic failing pair without touching specs/tokens.json.
 */
export function checkContrastPairs(
  definition: ComponentDefinition,
  contexts: string[],
  tokenData: TokensFile = loadRealTokens()
): ContrastCheckResult {
  const consumes = new Set(definition.tokens.consumes);
  const violations: ContrastViolation[] = [];
  let pairsChecked = 0;

  for (const [tokenName, leaf] of Object.entries(tokenData.sem)) {
    const pairedName = leaf.$extensions?.["ds.contrastPair"];
    if (typeof pairedName !== "string") continue;

    const tokenVar = `--sem-${tokenName}`;
    const pairedVar = `--sem-${pairedName}`;
    if (!consumes.has(tokenVar) && !consumes.has(pairedVar)) continue;

    const pairedLeaf = tokenData.sem[pairedName];
    if (!pairedLeaf || leaf.resolution === undefined || pairedLeaf.resolution === undefined) continue;

    for (const context of contexts) {
      const a = resolveLiteral(tokenData.prim, leaf.resolution, context);
      const b = resolveLiteral(tokenData.prim, pairedLeaf.resolution, context);
      if (typeof a !== "string" || typeof b !== "string") continue; // typography composites aren't colors
      pairsChecked++;
      const ratio = contrastRatio(a, b);
      if (ratio === undefined) continue;
      if (ratio < AA_CONTRAST_MIN) {
        violations.push({ context, token: tokenVar, pairedToken: pairedVar, ratio });
      }
    }
  }

  return { violations, pairsChecked };
}
