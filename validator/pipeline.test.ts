import { describe, expect, it } from "vitest";
import { Registry } from "../registry/registry.js";
import { loadJson, loadText, registerCompositionStubs } from "../test/helpers.js";
import { runPipeline } from "./pipeline.js";
import type { Candidate } from "./types.js";

describe("P2 positive path: ds-button", () => {
  it("registers cleanly through the full pipeline with zero warnings", () => {
    const registry = new Registry();
    registerCompositionStubs(registry);

    const definition = loadJson("../specs/ds-button.definition.json");
    const css = loadText("./fixtures/ds-button.css");
    const candidate: Candidate = {
      definition,
      requestType: "register",
      css,
      template: "<button><slot name=\"icon\"></slot><slot></slot></button>",
    };

    const record = runPipeline(candidate, registry);

    expect(record.rejection, `expected no rejection, got: ${JSON.stringify(record.rejection)}`).toBeUndefined();
    expect(record.passed).toBe(true);
    expect(record.outcome).toBe("registered");
    expect(record.warnings).toHaveLength(0);
    expect(record.candidateName).toBe("ds-button");

    const entry = registry.get("ds-button");
    expect(entry).toBeDefined();
    expect(entry?.flagged).toBe(false);

    // Stage 4 is a recorded no-op placeholder in M2.
    const stage4 = record.stages.find((s) => s.stage === 4);
    expect(stage4?.notes).toContain("stage4: deferred to M3");

    // btn-perf (performance) and btn-a11y (accessibility) are known constraint
    // types deferred to Stage 4, not rejected and not silently dropped.
    const stage3 = record.stages.find((s) => s.stage === 3);
    expect(stage3?.notes.some((n) => n.includes("performance") && n.includes("deferred"))).toBe(true);
    expect(stage3?.notes.some((n) => n.includes("accessibility") && n.includes("deferred"))).toBe(true);
  });

  it("rejects the same ds-button definition if the css leaks a primitive token", () => {
    const registry = new Registry();
    registerCompositionStubs(registry);

    const definition = loadJson("../specs/ds-button.definition.json");
    const candidate: Candidate = {
      definition,
      requestType: "register",
      css: ":host { background: var(--prim-color-blue-500); }",
      template: "<button><slot></slot></button>",
    };

    const record = runPipeline(candidate, registry);
    expect(record.passed).toBe(false);
    expect(record.rejection?.constraintId).toBe("btn-token-wall");
  });
});
