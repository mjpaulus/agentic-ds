// P3: Generation (success-criteria.md P3). Runs the ten recorded corpus
// attempts (test/generation/requirements + test/generation/attempts) through
// the REAL pipeline via the generic css/source fallback synthesis
// (generation/synthesize.ts) and asserts the P3 pass criteria. See
// test/generation/results.md for the honest per-attempt outcome record —
// this file only asserts the aggregate contract, it does not hand-pick which
// attempts "should" pass.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { generateDefinition, type GenerationCorpus } from "../../generation/generate-definition.js";
import { validateRequirement, type StructuredRequirement } from "../../generation/requirement.js";
import { synthesizeCss, synthesizeSource } from "../../generation/synthesize.js";
import { Registry } from "../../registry/registry.js";
import { runPipeline } from "../../validator/pipeline.js";
import type { Candidate, ComponentDefinition, ValidationRecord } from "../../validator/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REQUIREMENTS_DIR = resolve(__dirname, "requirements");
const ATTEMPTS_DIR = resolve(__dirname, "attempts");

function loadRequirements(): StructuredRequirement[] {
  return readdirSync(REQUIREMENTS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(resolve(REQUIREMENTS_DIR, f), "utf-8")) as StructuredRequirement);
}

function loadAttempts(): ComponentDefinition[] {
  return readdirSync(ATTEMPTS_DIR)
    .filter((f) => f.endsWith(".definition.json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(resolve(ATTEMPTS_DIR, f), "utf-8")) as ComponentDefinition);
}

/** requirements[i] pairs with attempts[i] positionally (req-01 <-> attempt-01, ...). */
function buildCorpus(requirements: StructuredRequirement[], attempts: ComponentDefinition[]): GenerationCorpus {
  const corpus: GenerationCorpus = {};
  requirements.forEach((req, i) => {
    const attempt = attempts[i];
    if (!attempt) throw new Error(`No attempt recorded for requirement "${req.id}" at index ${i}.`);
    corpus[req.id] = attempt;
  });
  return corpus;
}

const REJECTED_ALTERNATIVE_SIGNAL = /reject|alternative|instead/i;

describe("P3: generation corpus (10 requirements -> 10 recorded attempts -> full pipeline)", () => {
  const requirements = loadRequirements();
  const attempts = loadAttempts();
  const corpus = buildCorpus(requirements, attempts);

  it("has exactly 10 requirements and 10 attempts, each requirement schema-valid", () => {
    expect(requirements).toHaveLength(10);
    expect(attempts).toHaveLength(10);
    for (const req of requirements) {
      const result = validateRequirement(req);
      expect(result.valid, `requirement "${req.id}" invalid: ${result.errors.join("; ")}`).toBe(true);
    }
  });

  it("runs every attempt through the real pipeline, all justifications populated with a rejected-alternative signal, >= 7/10 register", async () => {
    const registry = new Registry();
    const records: { id: string; name: string; record: ValidationRecord }[] = [];

    for (const req of requirements) {
      const definition = generateDefinition(req, corpus);
      const candidate: Candidate = {
        definition,
        requestType: "register",
        css: synthesizeCss(definition),
        source: synthesizeSource(definition),
      };
      const record = await runPipeline(candidate, registry);
      records.push({ id: req.id, name: definition.name, record });
    }

    // Every attempt, pass or fail, carries a real justification (non-negotiable #5).
    for (const req of requirements) {
      const definition = corpus[req.id] as ComponentDefinition;
      const justification = definition.provenance.justification ?? "";
      expect(justification.trim().length, `"${definition.name}" has an empty justification`).toBeGreaterThan(0);
      // Test-level heuristic ONLY (comment per CLAUDE.md rule #6 - the
      // validator itself never reads prose fields to make decisions): a
      // crude case-insensitive signal that the justification names a
      // rejected alternative, not a semantic check of the prose's quality.
      expect(
        REJECTED_ALTERNATIVE_SIGNAL.test(justification),
        `"${definition.name}"'s justification has no reject/alternative/instead signal`
      ).toBe(true);
    }

    const passed = records.filter((r) => r.record.passed);
    const failed = records.filter((r) => !r.record.passed);

    // Every failed attempt's record names the failing constraint (or, for a
    // stage1/2 structural rejection, the module) and a source span -- P2's
    // "validation record naming the failing constraint id and source span"
    // bar (success-criteria.md), applied here to P3's failures too.
    for (const f of failed) {
      expect(f.record.rejection, `"${f.name}" failed with no rejection detail`).toBeDefined();
      const rejection = f.record.rejection!;
      expect(rejection.module.length).toBeGreaterThan(0);
      expect(rejection.sourceSpan.length).toBeGreaterThan(0);
      expect(rejection.message.length).toBeGreaterThan(0);
    }

    expect(
      passed.length,
      `expected >= 7/10 to register; got ${passed.length}/10. Failures: ${failed
        .map((f) => `${f.name} (${f.record.rejection?.module}: ${f.record.rejection?.message})`)
        .join(" | ")}`
    ).toBeGreaterThanOrEqual(7);
  });
});
