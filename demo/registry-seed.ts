// Shared registration helper for the M6 runtime seam. Deliberately NOT
// imported from test/helpers.ts (CLAUDE.md M6 hard rule: build the /api/adapt
// catalog without importing test code into the server). Mirrors
// test/helpers.ts's registerAllComponents dependency order (atoms ->
// molecules -> ds-button) but reads definitions straight from /specs and
// /definitions itself.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateComponent } from "../generator/generate.js";
import { Registry } from "../registry/registry.js";
import { runPipeline } from "../validator/pipeline.js";
import type { Candidate, ComponentDefinition } from "../validator/types.js";
import type { CatalogEntry } from "../adaptation/contract.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPECS_DIR = resolve(__dirname, "../specs");
const DEFINITIONS_DIR = resolve(__dirname, "../definitions");

const REGISTRATION_ORDER = [
  "ds-label",
  "ds-badge",
  "ds-text-input",
  "ds-checkbox",
  "ds-form-field",
  "ds-search-bar",
  "ds-button",
];

function definitionPathFor(name: string): string {
  return name === "ds-button" ? resolve(SPECS_DIR, "ds-button.definition.json") : resolve(DEFINITIONS_DIR, `${name}.definition.json`);
}

function loadDefinition(name: string): ComponentDefinition {
  return JSON.parse(readFileSync(definitionPathFor(name), "utf-8")) as ComponentDefinition;
}

function candidateFor(name: string): Candidate {
  const definition = loadDefinition(name);
  const generated = generateComponent(definition);
  return { definition, requestType: "register", source: generated.source, template: generated.template, css: generated.css };
}

/** Builds a fresh in-process Registry with all seven real components registered, in the only order the closed-world composition checks allow. */
export async function seedRegistry(): Promise<Registry> {
  const registry = new Registry();
  for (const name of REGISTRATION_ORDER) {
    const record = await runPipeline(candidateFor(name), registry);
    if (!record.passed) {
      throw new Error(`registry-seed: failed to register "${name}": ${JSON.stringify(record.rejection, null, 2)}`);
    }
  }
  return registry;
}

/**
 * name + purpose from each registered, composable definition — the catalog
 * adaptation/contract.ts's buildQuestions consumes. Purpose is the
 * description's first sentence only: definitions go on to describe
 * mutability and token binding, which is implementation detail that would
 * only distract Jev (jaggedness #5, irrelevant state).
 */
export function catalogFrom(registry: Registry): CatalogEntry[] {
  return registry
    .all()
    .filter((entry) => registry.isComposable(entry.name))
    .map((entry) => ({ name: entry.name, purpose: firstSentence(entry.definition.description) }));
}

function firstSentence(text: string): string {
  const match = /^(.*?[.!?])(\s|$)/.exec(text.trim());
  return match?.[1] ?? text.trim();
}
