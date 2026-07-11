import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { resolveLiteral } from "./resolve.js";
import type { PrimTree, SemTree, TokensFile } from "./types.js";

/**
 * Emit the --sem-* declaration lines for one context. PRIMITIVE COMPILE-AWAY
 * (CLAUDE.md non-negotiable #1, hardcoded): every value emitted here is a
 * resolved literal from the prim tree, never a `--prim-*` custom property
 * reference. This is a physical property of this function, not gated by any
 * failureBehavior.
 */
function emitSemLines(prim: PrimTree, sem: SemTree, context: string): string[] {
  const lines: string[] = [];
  for (const [name, leaf] of Object.entries(sem)) {
    if (leaf.resolution === undefined) continue;
    const varName = `--sem-${name}`;

    if (leaf.$type === "typography") {
      const resolved = resolveLiteral(prim, leaf.resolution, context);
      if (typeof resolved === "string" || typeof resolved === "number") {
        throw new Error(`Expected composite typography resolution for "${name}"`);
      }
      const { family, size, weight, lineHeight } = resolved;
      lines.push(`${varName}: ${weight} ${size}/${lineHeight} ${family};`);
      lines.push(`${varName}-family: ${family};`);
      lines.push(`${varName}-size: ${size};`);
      lines.push(`${varName}-weight: ${weight};`);
      lines.push(`${varName}-line-height: ${lineHeight};`);
      continue;
    }

    const literal = resolveLiteral(prim, leaf.resolution, context);
    if (typeof literal !== "string" && typeof literal !== "number") {
      throw new Error(`Expected scalar resolution for "${name}"`);
    }
    if (leaf.densityScaled) {
      lines.push(`${varName}: calc(${literal} * var(--ctx-density-scale));`);
    } else {
      lines.push(`${varName}: ${literal};`);
    }
  }
  return lines;
}

/** Emit the --ctx-* declaration lines for one context. */
function emitCtxLines(prim: PrimTree, ctx: TokensFile["ctx"], context: string): string[] {
  const lines: string[] = [];
  const leaves = ctx[context];
  if (!leaves) {
    throw new Error(`No ctx tree defined for context "${context}"`);
  }
  for (const [name, leaf] of Object.entries(leaves)) {
    const varName = `--ctx-${name}`;
    if (leaf.resolution !== undefined) {
      const literal = resolveLiteral(prim, leaf.resolution, context);
      if (typeof literal !== "string" && typeof literal !== "number") {
        throw new Error(`Expected scalar resolution for ctx "${context}.${name}"`);
      }
      lines.push(`${varName}: ${literal};`);
    } else if (leaf.$value !== undefined) {
      // Behavioral / plain literal ctx tokens (e.g. density-scale, validation-mode)
      // are emitted as unquoted custom property values.
      lines.push(`${varName}: ${leaf.$value};`);
    }
  }
  return lines;
}

function emitContextBlock(data: TokensFile, context: string): string {
  const lines = [
    ...emitSemLines(data.prim, data.sem, context),
    ...emitCtxLines(data.prim, data.ctx, context),
  ];
  const body = lines.map((line) => `  ${line}`).join("\n");
  return `:root[data-context='${context}'] {\n${body}\n}`;
}

export interface EmittedCss {
  perContext: Record<string, string>;
  combined: string;
}

/**
 * Emit CSS for every context declared in rules.contexts. Returns the raw CSS
 * text for each context individually plus a combined convenience file.
 */
export function emitCss(data: TokensFile): EmittedCss {
  const perContext: Record<string, string> = {};
  for (const context of data.rules.contexts) {
    perContext[context] = emitContextBlock(data, context);
  }
  const combined = data.rules.contexts
    .map((context) => perContext[context])
    .join("\n\n");
  return { perContext, combined };
}

/** Write emitted CSS to tokens/dist/. Creates the directory if needed. */
export function writeCssFiles(emitted: EmittedCss, outDir: string): string[] {
  mkdirSync(outDir, { recursive: true });
  const written: string[] = [];
  for (const [context, css] of Object.entries(emitted.perContext)) {
    const path = `${outDir}/context-${context}.css`;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, css + "\n", "utf-8");
    written.push(path);
  }
  const combinedPath = `${outDir}/tokens.css`;
  writeFileSync(combinedPath, emitted.combined + "\n", "utf-8");
  written.push(combinedPath);
  return written;
}
