// npm run adaptation:record. Runs the LIVE TypeSafe backend over every task
// key already present in adaptation/fixtures/recorded-answers.json and
// rewrites the file with real answers + provenance "recorded-from-jev".
// Requires TYPESAFE_API_KEY. Node-only.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ADAPTATION_MODEL } from "./contract.js";
import { TypeSafeAdaptationDecider } from "./backends/typesafe.js";
import type { FixtureFile } from "./backends/recorded.js";
import { seedRegistry, catalogFrom } from "../demo/registry-seed.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(__dirname, "fixtures/recorded-answers.json");

async function main(): Promise<void> {
  if (!process.env.TYPESAFE_API_KEY) {
    console.error("adaptation:record requires TYPESAFE_API_KEY to be set.");
    process.exit(1);
  }

  const file = JSON.parse(readFileSync(FIXTURE_PATH, "utf-8")) as FixtureFile;
  const registry = await seedRegistry();
  const catalog = catalogFrom(registry);
  const decider = new TypeSafeAdaptationDecider();

  const nextFixtures: FixtureFile["fixtures"] = {};
  for (const [task, existing] of Object.entries(file.fixtures)) {
    console.log(`recording: "${task}"`);
    const raw = await decider.decide({ task, currentContext: existing.context.choice, catalog });
    nextFixtures[task] = {
      provenance: "recorded-from-jev",
      context: raw.context,
      components: raw.components,
      is_destructive: raw.is_destructive,
      needs_guidance: raw.needs_guidance,
      gap: raw.gap,
    };
  }

  const next: FixtureFile = {
    provenance: "recorded-from-jev",
    model: ADAPTATION_MODEL,
    note: `Recorded from live jev-1.13.0 output on ${new Date().toISOString()}. Re-run npm run adaptation:record to refresh.`,
    fixtures: nextFixtures,
  };
  writeFileSync(FIXTURE_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf-8");
  console.log(`Wrote ${Object.keys(nextFixtures).length} recorded fixtures to ${FIXTURE_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
