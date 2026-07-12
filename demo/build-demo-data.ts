// Build entry: npm run build:demo-data. Runs the REAL pipeline over the P3
// corpus, the poison (primitive-token) adversarial fixture, and a ds-button
// revalidation, and writes the genuine validation records to
// demo/demo-data.json. The demo page fetches this file and replays these
// records — honest labeling: they are produced by the real pipeline at
// build time, not fabricated for display. Only the gate simulation (Step 4)
// runs live in the browser, against synthetic telemetry generated client-side.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateDefinition, type GenerationCorpus } from "../generation/generate-definition.js";
import { validateRequirement, type StructuredRequirement } from "../generation/requirement.js";
import { synthesizeCss, synthesizeSource } from "../generation/synthesize.js";
import { Registry } from "../registry/registry.js";
import { revalidateViaPipeline } from "../telemetry/node.js";
import { runPipeline } from "../validator/pipeline.js";
import type { Candidate, ComponentDefinition, ValidationRecord } from "../validator/types.js";
import { registerAllComponents } from "../test/helpers.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REQUIREMENTS_DIR = resolve(__dirname, "../test/generation/requirements");
const ATTEMPTS_DIR = resolve(__dirname, "../test/generation/attempts");
const ADVERSARIAL_DIR = resolve(__dirname, "../test/adversarial");
const OUT_PATH = resolve(__dirname, "demo-data.json");

interface P3DemoRecord {
  requirementId: string;
  requirement: StructuredRequirement;
  definition: ComponentDefinition;
  css: string;
  record: ValidationRecord;
}

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

async function buildP3Records(): Promise<P3DemoRecord[]> {
  const requirements = loadRequirements();
  const attempts = loadAttempts();
  const corpus: GenerationCorpus = {};
  requirements.forEach((req, i) => {
    corpus[req.id] = attempts[i] as ComponentDefinition;
  });

  const registry = new Registry();
  const results: P3DemoRecord[] = [];
  for (const req of requirements) {
    const valid = validateRequirement(req);
    if (!valid.valid) throw new Error(`requirement "${req.id}" is not schema-valid: ${valid.errors.join("; ")}`);
    const definition = generateDefinition(req, corpus);
    const css = synthesizeCss(definition);
    const candidate: Candidate = { definition, requestType: "register", css, source: synthesizeSource(definition) };
    const record = await runPipeline(candidate, registry);
    results.push({ requirementId: req.id, requirement: req, definition, css, record });
  }
  return results;
}

interface PoisonDemoRecord {
  definition: ComponentDefinition;
  css: string;
  record: ValidationRecord;
}

async function buildPoisonRecord(): Promise<PoisonDemoRecord> {
  const definition = JSON.parse(
    readFileSync(resolve(ADVERSARIAL_DIR, "primitive-token-reference.json"), "utf-8")
  ) as ComponentDefinition;
  const css = readFileSync(resolve(ADVERSARIAL_DIR, "primitive-token-reference.css"), "utf-8");
  const registry = new Registry();
  const candidate: Candidate = { definition, requestType: "register", css };
  const record = await runPipeline(candidate, registry);
  return { definition, css, record };
}

interface ButtonRevalidationDemoRecord {
  definition: ComponentDefinition;
  record: ValidationRecord;
}

async function buildButtonRevalidationRecord(): Promise<ButtonRevalidationDemoRecord> {
  const registry = new Registry();
  await registerAllComponents(registry);
  const entry = registry.get("ds-button");
  if (!entry) throw new Error("ds-button did not register; cannot build revalidation demo record.");
  const record = await revalidateViaPipeline(entry.definition, registry);
  return { definition: entry.definition, record };
}

export interface DemoData {
  generatedAt: string;
  p3: P3DemoRecord[];
  poison: PoisonDemoRecord;
  buttonRevalidation: ButtonRevalidationDemoRecord;
}

export async function buildDemoData(): Promise<DemoData> {
  // Sequential, not Promise.all: each of these spins up multiple happy-dom
  // Windows for Stage 4 rendering, and running them concurrently produced
  // real (non-deterministic) keyboard-probe flakiness under plain node/tsx
  // (outside vitest's test isolation) — safer and still fast enough to run
  // one at a time.
  const p3 = await buildP3Records();
  const poison = await buildPoisonRecord();
  const buttonRevalidation = await buildButtonRevalidationRecord();
  return { generatedAt: new Date().toISOString(), p3, poison, buttonRevalidation };
}

function isMain(): boolean {
  const invoked = process.argv[1] ? resolve(process.argv[1]) : "";
  return invoked === fileURLToPath(import.meta.url);
}

if (isMain()) {
  buildDemoData()
    .then((data) => {
      const dir = dirname(OUT_PATH);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(OUT_PATH, JSON.stringify(data, null, 2), "utf-8");
      const passed = data.p3.filter((r) => r.record.passed).length;
      console.log(`wrote ${OUT_PATH}`);
      console.log(`  P3: ${passed}/${data.p3.length} registered`);
      console.log(`  poison: ${data.poison.record.passed ? "REGISTERED (unexpected!)" : "rejected (expected)"}`);
      console.log(`  ds-button revalidation: ${data.buttonRevalidation.record.passed ? "passed" : "FAILED"}`);
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.stack ?? err.message : String(err));
      process.exit(1);
    });
}
