// Shared test helpers for M2 validator/registry/adversarial tests.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Registry } from "../registry/registry.js";
import { runPipeline } from "../validator/pipeline.js";
import type { Candidate, ValidationRecord } from "../validator/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function loadJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(resolve(__dirname, relativePath), "utf-8"));
}

export function loadText(relativePath: string): string {
  return readFileSync(resolve(__dirname, relativePath), "utf-8");
}

/**
 * ds-button's definition declares composition.allowedParents referencing
 * ds-form-field and ds-search-bar. The composition module's static check is
 * closed-world (every referenced name must already be registered), and
 * neither molecule exists yet in M2 (they land in M4). Registering minimal
 * stub definitions for them before registering ds-button is a deliberate M2
 * test-fixture design call — see the final report for the rejected
 * alternative (loosening the composition check to skip allowedParents).
 */
export function registerCompositionStubs(registry: Registry): void {
  for (const name of ["ds-form-field", "ds-search-bar"]) {
    const definition = {
      name,
      version: "1.0.0",
      componentType: "molecule",
      mutability: "adaptive",
      description: `M2 composition-closure stub for ${name}. Not a real implementation; exists only so ds-button's declared allowedParents resolve against the registry (real ${name} lands in M4).`,
      api: { properties: [] },
      tokens: { consumes: ["--sem-color-test-bg"] },
      constraints: [
        {
          id: "stub-token-wall",
          type: "token-usage",
          rule: { allowedTiers: ["sem", "ctx"], consumesOnly: true },
          failureBehavior: "reject",
          rationale: "The token wall is the contract.",
        },
      ],
      provenance: { author: "human", createdAt: "2026-07-11T00:00:00Z" },
    };
    const candidate: Candidate = { definition, requestType: "register" };
    const record = runPipeline(candidate, registry);
    if (!record.passed) {
      throw new Error(`Failed to register composition stub "${name}": ${JSON.stringify(record.rejection)}`);
    }
  }
}

export function assertRejected(record: ValidationRecord): asserts record is ValidationRecord & { rejection: NonNullable<ValidationRecord["rejection"]> } {
  if (record.passed || !record.rejection) {
    throw new Error(`Expected candidate to be rejected, got: ${JSON.stringify(record, null, 2)}`);
  }
}
