import { describe, expect, it } from "vitest";
import { decideWithFallback, type AdaptationDecider } from "./decider.js";
import { ADAPTATION_MODEL, CONTRACT_VERSION } from "./contract.js";

const throwingDecider: AdaptationDecider = {
  async decide() {
    throw new Error("boom: backend unreachable");
  },
};

describe("decideWithFallback", () => {
  it("resolves to keep/empty/unavailable when the decider throws, without the exception escaping", async () => {
    const decision = await decideWithFallback(
      throwingDecider,
      { task: "anything", currentContext: "consumer-web", catalog: [] },
      { isComposable: () => true },
      { model: ADAPTATION_MODEL, contractVersion: CONTRACT_VERSION }
    );
    expect(decision.contextAction).toBe("keep");
    expect(decision.contextChoice).toBe("consumer-web");
    expect(decision.components).toEqual([]);
    expect(decision.destructive).toBe(false);
    expect(decision.needsGuidance).toBe(false);
    expect(decision.gapDetected).toBe(false);
    expect(decision.record.mode).toBe("unavailable");
  });
});
