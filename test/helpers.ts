// Shared test helpers for M2 validator/registry/adversarial tests.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateComponent } from "../generator/generate.js";
import { Registry } from "../registry/registry.js";
import { runPipeline } from "../validator/pipeline.js";
import type { Candidate, ComponentDefinition, ValidationRecord } from "../validator/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPECS_DIR = resolve(__dirname, "../specs");
const DEFINITIONS_DIR = resolve(__dirname, "../definitions");

export function loadJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(resolve(__dirname, relativePath), "utf-8"));
}

export function loadText(relativePath: string): string {
  return readFileSync(resolve(__dirname, relativePath), "utf-8");
}

/** ds-button lives in /specs (the locked contract set); the other six live in /definitions. */
function definitionPathFor(name: string): string {
  return name === "ds-button" ? resolve(SPECS_DIR, "ds-button.definition.json") : resolve(DEFINITIONS_DIR, `${name}.definition.json`);
}

export function loadDefinition(name: string): ComponentDefinition {
  return JSON.parse(readFileSync(definitionPathFor(name), "utf-8")) as ComponentDefinition;
}

/**
 * Build a full register Candidate for a named component using the real
 * generator (generator/generate.ts), so tests exercise Stage 4 against
 * actual generated output rather than a hand-authored fixture standing in
 * for it.
 */
export function candidateFor(name: string): Candidate {
  const definition = loadDefinition(name);
  const generated = generateComponent(definition);
  return {
    definition,
    requestType: "register",
    source: generated.source,
    template: generated.template,
    css: generated.css,
  };
}

/** Backward-compatible alias used throughout the M2/M3 test suite. */
export function dsButtonCandidate(): Candidate {
  return candidateFor("ds-button");
}

const ATOMS = ["ds-label", "ds-badge", "ds-text-input", "ds-checkbox"];

/**
 * Registers ds-label, ds-badge, ds-text-input, ds-checkbox, ds-form-field,
 * and ds-search-bar (everything ds-button's locked composition.allowedParents
 * needs) through the FULL pipeline, in real dependency order. ds-button
 * itself is deliberately excluded so callers can register it separately
 * (most tests want to assert on that specific registration).
 *
 * Registration order is atoms -> ds-form-field -> ds-search-bar. ds-form-field
 * depends on the atoms (its composition.allowedChildren + "composition"
 * constraint do a real closed-world registry check). ds-search-bar does NOT
 * carry a "composition" constraint (see its definition's
 * provenance.justification): its allowedChildren names ds-button, and
 * ds-button's allowedParents names ds-search-bar right back -- a genuine
 * circular registration dependency created by combining a locked definition
 * (ds-button, editable only per Step 1's authorized consumes/version change)
 * with a required field on a definition this POC controls. The only
 * satisfiable order is atoms, then the two molecules (search-bar first,
 * since it has no closed-world composition check to block it), then
 * ds-button last, once both molecules are real registry entries.
 */
export async function registerAllExceptButton(registry: Registry): Promise<Record<string, ValidationRecord>> {
  const records: Record<string, ValidationRecord> = {};
  for (const name of [...ATOMS, "ds-form-field", "ds-search-bar"]) {
    const record = await runPipeline(candidateFor(name), registry);
    if (!record.passed) {
      throw new Error(`Failed to register "${name}": ${JSON.stringify(record.rejection, null, 2)}`);
    }
    records[name] = record;
  }
  return records;
}

/** All seven real components, atoms -> molecules -> ds-button last. */
export async function registerAllComponents(registry: Registry): Promise<Record<string, ValidationRecord>> {
  const records = await registerAllExceptButton(registry);
  const buttonRecord = await runPipeline(candidateFor("ds-button"), registry);
  if (!buttonRecord.passed) {
    throw new Error(`Failed to register "ds-button": ${JSON.stringify(buttonRecord.rejection, null, 2)}`);
  }
  records["ds-button"] = buttonRecord;
  return records;
}

export function assertRejected(record: ValidationRecord): asserts record is ValidationRecord & { rejection: NonNullable<ValidationRecord["rejection"]> } {
  if (record.passed || !record.rejection) {
    throw new Error(`Expected candidate to be rejected, got: ${JSON.stringify(record, null, 2)}`);
  }
}
