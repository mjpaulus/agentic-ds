import { describe, expect, it } from "vitest";
import { Registry } from "../../registry/registry.js";
import { runPipeline } from "../../validator/pipeline.js";
import { runStage3 } from "../../validator/stage3-constraints.js";
import type { Candidate, ComponentDefinition } from "../../validator/types.js";
import { loadJson, loadText, registerCompositionStubs } from "../helpers.js";
import { adversarialManifest } from "./manifest.js";

describe("P2 adversarial suite: zero false negatives", () => {
  for (const testCase of adversarialManifest) {
    if ("skip" in testCase.expected) {
      it.skip(`${testCase.name}: ${testCase.expected.skip}`, () => {});
      continue;
    }
    const expected = testCase.expected;

    it(`${testCase.name}: rejects at stage ${expected.stage}`, () => {
      const registry = new Registry();
      registerCompositionStubs(registry);

      switch (testCase.setup) {
        case "register-ds-button": {
          const buttonDef = loadJson("../specs/ds-button.definition.json");
          const setupCandidate: Candidate = {
            definition: buttonDef,
            requestType: "register",
            ...(testCase.template !== undefined ? { template: testCase.template } : {}),
          };
          const setupRecord = runPipeline(setupCandidate, registry);
          expect(setupRecord.passed, `ds-button base registration must succeed: ${JSON.stringify(setupRecord.rejection)}`).toBe(true);
          break;
        }
        case "register-fixed": {
          const fixedDef = loadJson(`./adversarial/${testCase.file}`);
          const setupRecord = runPipeline({ definition: fixedDef, requestType: "register" }, registry);
          expect(setupRecord.passed, `fixed base registration must succeed: ${JSON.stringify(setupRecord.rejection)}`).toBe(true);
          break;
        }
        case "register-loosen-base": {
          const baseDef = loadJson("./adversarial/ai-mutability-loosening-base.json");
          const setupCandidate: Candidate = {
            definition: baseDef,
            requestType: "register",
            ...(testCase.template !== undefined ? { template: testCase.template } : {}),
          };
          const setupRecord = runPipeline(setupCandidate, registry);
          expect(setupRecord.passed, `loosening-base registration must succeed: ${JSON.stringify(setupRecord.rejection)}`).toBe(true);
          break;
        }
        case "none":
          break;
      }

      const definition = loadJson(`./adversarial/${testCase.file}`);
      const css = testCase.cssFile ? loadText(`./adversarial/${testCase.cssFile}`) : undefined;
      const candidate: Candidate = {
        definition,
        requestType: testCase.requestType,
        ...(css !== undefined ? { css } : {}),
        ...(testCase.template !== undefined ? { template: testCase.template } : {}),
      };

      const record = runPipeline(candidate, registry);

      expect(record.passed).toBe(false);
      expect(record.outcome).toBe("rejected");
      expect(record.rejection).toBeDefined();
      const rejection = record.rejection!;
      expect(rejection.stage).toBe(expected.stage);
      expect(rejection.module).toBe(expected.module);
      if (expected.stage === 3) {
        expect(rejection.constraintId).toBe(expected.constraintId);
      }
      // P2: every rejection record must name a non-empty source span and message.
      expect(rejection.sourceSpan).toBeTruthy();
      expect(rejection.message.length).toBeGreaterThan(0);
    });
  }
});

describe("P2 adversarial suite: Stage 3 dispatcher defensive rejection (direct unit test)", () => {
  it("rejects an unknown constraint type when called directly, bypassing Stage 2", () => {
    const registry = new Registry();
    const raw = loadJson("./adversarial/unknown-constraint-type.json") as unknown as ComponentDefinition;
    // Calling runStage3 directly simulates a definition that reached Stage 3
    // without going through ajv — the dispatcher must still refuse an
    // unrecognized constraint type (Section 1 item 3: two independent
    // defenses, not one).
    const candidate: Candidate = { definition: raw, requestType: "register" };
    const outcome = runStage3(candidate, raw, registry);
    expect(outcome.rejection).toBeDefined();
    expect(outcome.rejection?.module).toBe("stage3-constraints");
    expect(outcome.rejection?.sourceSpan).toBe("constraints[0].type");
    expect(outcome.rejection?.message).toContain("vibes");
  });
});
