import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Registry } from "../../registry/registry.js";
import { runPipeline } from "../../validator/pipeline.js";
import { runStage3 } from "../../validator/stage3-constraints.js";
import type { Candidate, ComponentDefinition } from "../../validator/types.js";
import type { TokensFile } from "../../tokens/types.js";
import { dsButtonCandidate, loadJson, registerAllExceptButton } from "../helpers.js";
import { adversarialManifest } from "./manifest.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Synthetic contrastPair token data for the contrast-failure-one-context
 * fixture. `--sem-color-test-fg` passes AA against `--sem-color-test-bg` in
 * consumer-web (#757575 on white ~= 4.6:1) but fails in enterprise-saas
 * (#aaaaaa on white ~= 2.3:1) — "violates exactly one constraint, in exactly
 * one context", per the P2 adversarial suite's design. Injected via
 * runPipeline's tokenData param so specs/tokens.json is never touched.
 */
const SYNTHETIC_CONTRAST_TOKENS: TokensFile = {
  version: "test-synthetic",
  rules: {
    contexts: ["consumer-web", "enterprise-saas"],
    tiers: {
      prim: { mayReference: [], componentAccessible: false, emitToCss: false },
      sem: { mayReference: ["prim"], componentAccessible: true, emitToCss: true },
      ctx: { mayReference: ["prim"], componentAccessible: true, emitToCss: true },
    },
  },
  prim: {
    color: {
      white: { $type: "color", $value: "#ffffff" },
      midgray: { $type: "color", $value: "#757575" },
      lightgray: { $type: "color", $value: "#aaaaaa" },
    },
  },
  sem: {
    "color-test-bg": { $type: "color", resolution: "{prim.color.white}" },
    "color-test-fg": {
      $type: "color",
      $extensions: { "ds.contrastPair": "color-test-bg" },
      resolution: { "consumer-web": "{prim.color.midgray}", "enterprise-saas": "{prim.color.lightgray}" },
    },
  },
  ctx: { "consumer-web": {}, "enterprise-saas": {} },
};

describe("P2 adversarial suite: zero false negatives", () => {
  for (const testCase of adversarialManifest) {
    if ("skip" in testCase.expected) {
      it.skip(`${testCase.name}: ${testCase.expected.skip}`, () => {});
      continue;
    }
    const expected = testCase.expected;

    it(`${testCase.name}: rejects at stage ${expected.stage}`, async () => {
      const registry = new Registry();
      await registerAllExceptButton(registry);

      switch (testCase.setup) {
        case "register-ds-button": {
          const setupRecord = await runPipeline(dsButtonCandidate(), registry);
          expect(setupRecord.passed, `ds-button base registration must succeed: ${JSON.stringify(setupRecord.rejection)}`).toBe(true);
          break;
        }
        case "register-fixed": {
          const fixedDef = loadJson(`./adversarial/${testCase.file}`);
          const setupRecord = await runPipeline({ definition: fixedDef, requestType: "register" }, registry);
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
          const setupRecord = await runPipeline(setupCandidate, registry);
          expect(setupRecord.passed, `loosening-base registration must succeed: ${JSON.stringify(setupRecord.rejection)}`).toBe(true);
          break;
        }
        case "none":
          break;
      }

      const definition = loadJson(`./adversarial/${testCase.file}`);
      const css = testCase.cssFile ? readFileSync(resolve(__dirname, testCase.cssFile), "utf-8") : undefined;
      const source = testCase.sourceFile ? readFileSync(resolve(__dirname, testCase.sourceFile), "utf-8") : undefined;
      const candidate: Candidate = {
        definition,
        requestType: testCase.requestType,
        ...(css !== undefined ? { css } : {}),
        ...(source !== undefined ? { source } : {}),
        ...(testCase.template !== undefined ? { template: testCase.template } : {}),
      };

      const tokenData = testCase.useSyntheticContrastTokens ? SYNTHETIC_CONTRAST_TOKENS : undefined;
      const record = tokenData ? await runPipeline(candidate, registry, tokenData) : await runPipeline(candidate, registry);

      expect(record.passed).toBe(false);
      expect(record.outcome).toBe("rejected");
      expect(record.rejection).toBeDefined();
      const rejection = record.rejection!;
      expect(rejection.stage).toBe(expected.stage);
      expect(rejection.module).toBe(expected.module);
      if (expected.stage === 3 || expected.stage === 4) {
        expect(rejection.constraintId).toBe(expected.constraintId);
      }
      if (expected.stage === 4 && expected.messageContains) {
        expect(rejection.message).toContain(expected.messageContains);
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
