// @vitest-environment node
//
// Real-call smoke test. Skipped unless TYPESAFE_API_KEY is set — CI runs
// without a key and stays green; a developer with a key can run
// `TYPESAFE_API_KEY=... npm run test:m6` to exercise the live backend.
// Node environment is required: under the suite's default happy-dom the SDK
// sees a `window` and refuses to construct a client that would expose the
// key in a browser — the safety behavior we rely on, not a bug to bypass.
import { describe, expect, it } from "vitest";
import { TypeSafeAdaptationDecider } from "./backends/typesafe.js";

describe.skipIf(!process.env.TYPESAFE_API_KEY)("live TypeSafe backend (smoke)", () => {
  it("returns a shape matching RawAnswers", async () => {
    const decider = new TypeSafeAdaptationDecider();
    const raw = await decider.decide({
      task: "Sign me up for the newsletter",
      currentContext: "consumer-web",
      catalog: [{ name: "ds-button", purpose: "clickable action trigger" }],
    });
    expect(raw.context.choice).toMatch(/consumer-web|enterprise-saas/);
    expect(typeof raw.context.confidence).toBe("number");
    expect(typeof raw.components["ds-button"]).toBe("number");
    expect(typeof raw.is_destructive).toBe("number");
    expect(typeof raw.needs_guidance).toBe("number");
    expect(typeof raw.gap).toBe("number");
  });
});
