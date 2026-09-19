import { describe, expect, it } from "vitest";
import { resolveAdaptation, type RawAnswers } from "./decider.js";
import { THRESHOLDS } from "./contract.js";

const meta = { model: "jev-1.13.0", contractVersion: "1.0.0", mode: "recorded" as const };

function raw(overrides: Partial<RawAnswers> = {}): RawAnswers {
  return {
    context: { choice: "enterprise-saas", probabilities: { "consumer-web": 0.1, "enterprise-saas": 0.9 }, confidence: 0.9 },
    components: {},
    is_destructive: 0,
    needs_guidance: 0,
    gap: 0,
    ...overrides,
  };
}

const composeAll = { isComposable: () => true };

describe("resolveAdaptation: context hysteresis", () => {
  it("keeps when the choice equals the current context, regardless of confidence", () => {
    const decision = resolveAdaptation(
      raw({ context: { choice: "consumer-web", probabilities: { "consumer-web": 0.95, "enterprise-saas": 0.05 }, confidence: 0.95 } }),
      "consumer-web",
      THRESHOLDS,
      composeAll,
      meta
    );
    expect(decision.contextAction).toBe("keep");
  });

  it("applies when different and confidence >= 0.8 (>= contextAutoApply)", () => {
    const decision = resolveAdaptation(
      raw({ context: { choice: "enterprise-saas", probabilities: { "consumer-web": 0.2, "enterprise-saas": 0.8 }, confidence: 0.8 } }),
      "consumer-web",
      THRESHOLDS,
      composeAll,
      meta
    );
    expect(decision.contextAction).toBe("apply");
  });

  it("suggests when different and confidence is 0.6 (in [suggest, autoApply))", () => {
    const decision = resolveAdaptation(
      raw({ context: { choice: "enterprise-saas", probabilities: { "consumer-web": 0.4, "enterprise-saas": 0.6 }, confidence: 0.6 } }),
      "consumer-web",
      THRESHOLDS,
      composeAll,
      meta
    );
    expect(decision.contextAction).toBe("suggest");
  });

  it("keeps when different but confidence is 0.3 (below suggest)", () => {
    const decision = resolveAdaptation(
      raw({ context: { choice: "enterprise-saas", probabilities: { "consumer-web": 0.7, "enterprise-saas": 0.3 }, confidence: 0.3 } }),
      "consumer-web",
      THRESHOLDS,
      composeAll,
      meta
    );
    expect(decision.contextAction).toBe("keep");
  });
});

describe("resolveAdaptation: components", () => {
  it("includes only components at/above componentRelevant, ordered by probability desc", () => {
    const decision = resolveAdaptation(
      raw({ components: { "ds-button": 0.9, "ds-badge": 0.61, "ds-label": 0.59, "ds-checkbox": 0.75 } }),
      "enterprise-saas",
      THRESHOLDS,
      composeAll,
      meta
    );
    expect(decision.components).toEqual(["ds-button", "ds-checkbox", "ds-badge"]);
  });

  it("excludes a flagged (non-composable) challenger even at high Noul — the wall", () => {
    const registryStub = {
      isComposable: (name: string) => name !== "ds-flagged-challenger",
    };
    const decision = resolveAdaptation(
      raw({ components: { "ds-button": 0.9, "ds-flagged-challenger": 0.99 } }),
      "enterprise-saas",
      THRESHOLDS,
      registryStub,
      meta
    );
    expect(decision.components).toEqual(["ds-button"]);
  });
});

describe("resolveAdaptation: flags", () => {
  it("sets destructive/needsGuidance/gap from their thresholds", () => {
    const decision = resolveAdaptation(
      raw({ is_destructive: 0.71, needs_guidance: 0.59, gap: 0.6 }),
      "enterprise-saas",
      THRESHOLDS,
      composeAll,
      meta
    );
    expect(decision.destructive).toBe(true);
    expect(decision.needsGuidance).toBe(false);
    expect(decision.gapDetected).toBe(true);
  });
});

describe("resolveAdaptation: record completeness", () => {
  it("carries model, contract version, mode, thresholds, raw answers, and a lever per answer", () => {
    const decision = resolveAdaptation(
      raw({ components: { "ds-button": 0.9 } }),
      "enterprise-saas",
      THRESHOLDS,
      composeAll,
      meta
    );
    expect(decision.record.model).toBe("jev-1.13.0");
    expect(decision.record.contractVersion).toBe("1.0.0");
    expect(decision.record.mode).toBe("recorded");
    expect(decision.record.thresholds).toBe(THRESHOLDS);
    expect(decision.record.raw.components["ds-button"]).toBe(0.9);
    const leverNames = decision.record.levers.map((l) => l.lever);
    expect(leverNames).toEqual(expect.arrayContaining(["context", "component:ds-button", "is_destructive", "needs_guidance", "gap"]));
  });
});
