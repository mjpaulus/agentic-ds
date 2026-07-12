// P5: Evolution (success-criteria.md P5). Uses ds-button's real
// compact-affordance challenger + synthetic telemetry to drive
// telemetry/gate.ts and telemetry/evolution.ts end to end against the real
// registry and real pipeline (via telemetry/node.ts's revalidateViaPipeline).

import { beforeEach, describe, expect, it } from "vitest";
import { Registry, RegistryIntegrityError } from "../../registry/registry.js";
import { deprecateChallenger, promoteChallenger } from "../../telemetry/evolution.js";
import { evaluateGate } from "../../telemetry/gate.js";
import { revalidateViaPipeline } from "../../telemetry/node.js";
import { generateEvents, type SyntheticGeneratorConfig } from "../../telemetry/synthetic.js";
import { registerAllComponents } from "../helpers.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const WINDOW_START = 1_700_000_000_000; // fixed epoch ms, deterministic
const WINDOW_DAYS = 14;

function winningConfig(seed: number): SyntheticGeneratorConfig {
  return {
    componentName: "ds-button",
    context: "enterprise-saas",
    seed,
    windowStart: WINDOW_START,
    windowMs: WINDOW_DAYS * MS_PER_DAY,
    variants: [
      { variantName: "standard", completionRate: 0.9, errorRate: 0.05, abandonmentRate: 0.1, timeToInteractionMs: 300, sampleCount: 600 },
      { variantName: "compact-affordance", completionRate: 0.92, errorRate: 0.04, abandonmentRate: 0.08, timeToInteractionMs: 258, sampleCount: 600 },
    ],
  };
}

function losingConfig(seed: number): SyntheticGeneratorConfig {
  return {
    componentName: "ds-button",
    context: "enterprise-saas",
    seed,
    windowStart: WINDOW_START,
    windowMs: WINDOW_DAYS * MS_PER_DAY,
    variants: [
      { variantName: "standard", completionRate: 0.9, errorRate: 0.05, abandonmentRate: 0.1, timeToInteractionMs: 300, sampleCount: 600 },
      { variantName: "compact-affordance", completionRate: 0.85, errorRate: 0.06, abandonmentRate: 0.12, timeToInteractionMs: 305, sampleCount: 600 },
    ],
  };
}

function splitByVariant(events: ReturnType<typeof generateEvents>, variantName: string) {
  return events.filter((e) => e.variantName === variantName);
}

async function freshRegistry(): Promise<Registry> {
  const registry = new Registry();
  await registerAllComponents(registry);
  return registry;
}

describe("P5: evolution gate + promotion transaction", () => {
  let registry: Registry;

  beforeEach(async () => {
    registry = await freshRegistry();
  });

  it("(a) a winning challenger promotes: revalidation runs and passes BEFORE the registry flips", async () => {
    const events = generateEvents(winningConfig(42));
    const incumbentEvents = splitByVariant(events, "standard");
    const challengerEvents = splitByVariant(events, "compact-affordance");

    const entry = registry.get("ds-button");
    expect(entry).toBeDefined();
    const gateConfig = entry!.definition.evolution!.gate;

    const gateResult = evaluateGate({
      incumbentEvents,
      challengerEvents,
      gate: gateConfig,
      windowStart: WINDOW_START,
      now: WINDOW_START + 5 * MS_PER_DAY, // well within the 14-day window
    });

    expect(gateResult.decision).toBe("promote");
    expect(gateResult.samples).toBeGreaterThanOrEqual(gateConfig.minSamples);
    expect(gateResult.relativeImprovement).toBeGreaterThanOrEqual(gateConfig.threshold);

    let revalidateCallCount = 0;
    const spyRevalidate = async (definition: Parameters<typeof revalidateViaPipeline>[0]) => {
      revalidateCallCount += 1;
      return revalidateViaPipeline(definition, registry);
    };

    // Pre-flip state: standard is incumbent, compact-affordance is challenger.
    const before = registry.get("ds-button")!;
    expect(before.definition.variants!.find((v) => v.name === "standard")!.status).toBe("incumbent");
    expect(before.definition.variants!.find((v) => v.name === "compact-affordance")!.status).toBe("challenger");

    const result = await promoteChallenger({
      registry,
      componentName: "ds-button",
      challengerVariant: "compact-affordance",
      revalidate: spyRevalidate,
    });

    expect(revalidateCallCount).toBe(1);
    expect(result.record.passed).toBe(true);
    // Stages 2-4 all ran and passed as part of that single revalidation call.
    expect(result.record.stages.map((s) => s.stage)).toEqual([2, 3, 4]);
    expect(result.record.stages.every((s) => s.passed)).toBe(true);
    expect(result.promoted).toBe(true);

    const after = registry.get("ds-button")!;
    expect(after.definition.variants!.find((v) => v.name === "compact-affordance")!.status).toBe("incumbent");
    expect(after.definition.variants!.find((v) => v.name === "standard")!.status).toBe("deprecated");
  });

  it("(a-fail) a failing revalidation aborts promotion: statuses are unchanged", async () => {
    const failingRevalidate = async () =>
      ({
        candidateName: "ds-button",
        passed: false,
        outcome: "rejected" as const,
        stages: [],
        rejection: {
          stage: 4 as const,
          module: "stage4-rendered",
          constraintId: "btn-a11y",
          message: "synthetic revalidation failure for the (a-fail) test path",
          sourceSpan: "constraints",
        },
        warnings: [],
        timestamp: new Date().toISOString(),
      });

    const result = await promoteChallenger({
      registry,
      componentName: "ds-button",
      challengerVariant: "compact-affordance",
      revalidate: failingRevalidate,
    });

    expect(result.promoted).toBe(false);
    expect(result.record.passed).toBe(false);

    const after = registry.get("ds-button")!;
    expect(after.definition.variants!.find((v) => v.name === "standard")!.status).toBe("incumbent");
    expect(after.definition.variants!.find((v) => v.name === "compact-affordance")!.status).toBe("challenger");
  });

  it("(b) a losing challenger auto-deprecates when the window closes; incumbent is untouched", async () => {
    const events = generateEvents(losingConfig(7));
    const incumbentEvents = splitByVariant(events, "standard");
    const challengerEvents = splitByVariant(events, "compact-affordance");

    const entry = registry.get("ds-button")!;
    const gateConfig = entry.definition.evolution!.gate;

    const gateResult = evaluateGate({
      incumbentEvents,
      challengerEvents,
      gate: gateConfig,
      windowStart: WINDOW_START,
      now: WINDOW_START + (WINDOW_DAYS + 1) * MS_PER_DAY, // window closed
    });

    expect(gateResult.decision).toBe("auto-deprecate");

    const result = deprecateChallenger({
      registry,
      componentName: "ds-button",
      challengerVariant: "compact-affordance",
      reason: "gate window closed without meeting threshold",
    });

    expect(result.entry.definition.variants!.find((v) => v.name === "compact-affordance")!.status).toBe("deprecated");

    const after = registry.get("ds-button")!;
    expect(after.definition.variants!.find((v) => v.name === "standard")!.status).toBe("incumbent");
  });

  it("(c) registry integrity: a manual two-incumbent write throws, and the promotion transaction never throws it", async () => {
    // Manual write that promotes compact-affordance to incumbent WITHOUT
    // also demoting "standard" leaves two incumbents overlapping on
    // enterprise-saas (standard covers both contexts, compact-affordance is
    // enterprise-saas-only) -- this must throw, and must leave the registry
    // untouched (still both at their original statuses).
    expect(() =>
      registry.updateVariantStatuses("ds-button", [{ variantName: "compact-affordance", status: "incumbent" }])
    ).toThrow(RegistryIntegrityError);
    const unchanged = registry.get("ds-button")!;
    expect(unchanged.definition.variants!.find((v) => v.name === "standard")!.status).toBe("incumbent");
    expect(unchanged.definition.variants!.find((v) => v.name === "compact-affordance")!.status).toBe("challenger");

    // The promotion transaction itself (which deprecates the former
    // incumbent in the SAME write as promoting the challenger) must never
    // throw the invariant error -- that's the entire point of the
    // single-write transaction.
    const registry3 = await freshRegistry();
    const result = await promoteChallenger({
      registry: registry3,
      componentName: "ds-button",
      challengerVariant: "compact-affordance",
      revalidate: (definition) => revalidateViaPipeline(definition, registry3),
    });
    expect(result.promoted).toBe(true);
  });

  it("determinism: same seed produces the same gate decision and metrics", () => {
    const eventsA = generateEvents(winningConfig(99));
    const eventsB = generateEvents(winningConfig(99));
    expect(eventsA).toEqual(eventsB);

    const gateConfig = { metric: "time-to-interaction" as const, threshold: 0.05, minSamples: 500, windowDays: 14 };
    const resultA = evaluateGate({
      incumbentEvents: splitByVariant(eventsA, "standard"),
      challengerEvents: splitByVariant(eventsA, "compact-affordance"),
      gate: gateConfig,
      windowStart: WINDOW_START,
      now: WINDOW_START + 5 * MS_PER_DAY,
    });
    const resultB = evaluateGate({
      incumbentEvents: splitByVariant(eventsB, "standard"),
      challengerEvents: splitByVariant(eventsB, "compact-affordance"),
      gate: gateConfig,
      windowStart: WINDOW_START,
      now: WINDOW_START + 5 * MS_PER_DAY,
    });
    expect(resultA).toEqual(resultB);
  });
});
