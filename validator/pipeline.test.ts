import { describe, expect, it } from "vitest";
import { Registry } from "../registry/registry.js";
import { dsButtonCandidate, loadJson, registerAllExceptButton } from "../test/helpers.js";
import { runPipeline } from "./pipeline.js";
import type { Candidate } from "./types.js";

describe("P2 positive path: ds-button", () => {
  it("registers cleanly through the full pipeline with zero warnings", async () => {
    const registry = new Registry();
    await registerAllExceptButton(registry);

    const candidate = dsButtonCandidate();
    const record = await runPipeline(candidate, registry);

    expect(record.rejection, `expected no rejection, got: ${JSON.stringify(record.rejection)}`).toBeUndefined();
    expect(record.passed).toBe(true);
    expect(["registered", "flagged"]).toContain(record.outcome);
    expect(record.candidateName).toBe("ds-button");

    const entry = registry.get("ds-button");
    expect(entry).toBeDefined();

    // Stage 4 actually ran (M3): notes mention contrast, keyboard, and perf checks.
    const stage4 = record.stages.find((s) => s.stage === 4);
    expect(stage4?.passed).toBe(true);
    expect(stage4?.notes.some((n) => n.includes("contrast"))).toBe(true);
    expect(stage4?.notes.some((n) => n.includes("keyboard operability"))).toBe(true);
    expect(stage4?.notes.some((n) => n.includes("perf"))).toBe(true);
  });

  it("rejects the same ds-button definition if the css leaks a primitive token", async () => {
    const registry = new Registry();
    await registerAllExceptButton(registry);

    const definition = loadJson("../specs/ds-button.definition.json");
    const candidate: Candidate = {
      definition,
      requestType: "register",
      css: ":host { background: var(--prim-color-blue-500); }",
      template: "<button><slot></slot></button>",
    };

    const record = await runPipeline(candidate, registry);
    expect(record.passed).toBe(false);
    expect(record.rejection?.constraintId).toBe("btn-token-wall");
  });
});
