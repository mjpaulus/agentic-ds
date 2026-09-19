import { describe, expect, it } from "vitest";
import { ADAPTATION_MODEL, buildQuestions, COMPONENT_QUESTION_PREFIX, THRESHOLDS } from "./contract.js";

const catalog = [
  { name: "ds-button", purpose: "clickable action trigger" },
  { name: "ds-form-field", purpose: "labeled input group" },
];

describe("contract: question shapes", () => {
  const questions = buildQuestions(catalog);

  it("includes context as a choice with structured criteria for both contexts", () => {
    expect(questions.context.type).toBe("choice");
    expect(questions.context.instructions).toEqual(expect.any(String));
    const criteria = (questions.context as { criteria: Record<string, unknown> }).criteria;
    expect(Object.keys(criteria).sort()).toEqual(["consumer-web", "enterprise-saas"]);
    for (const value of Object.values(criteria)) {
      expect(value).toMatchObject({ what: expect.any(String), not_for: expect.any(String), examples: expect.any(String) });
    }
  });

  it("includes one Noul per catalog component, absolute (not a single Choice)", () => {
    for (const entry of catalog) {
      const q = questions[`${COMPONENT_QUESTION_PREFIX}${entry.name}`];
      expect(q).toBeDefined();
      expect(q.type).toBe("noul");
    }
  });

  it("includes is_destructive, needs_guidance, and gap as Nouls", () => {
    for (const key of ["is_destructive", "needs_guidance", "gap"]) {
      expect(questions[key].type).toBe("noul");
      expect(questions[key].instructions).toEqual(expect.any(String));
    }
  });
});

describe("contract: thresholds and model pin", () => {
  it("keeps every threshold within [0, 1]", () => {
    for (const value of Object.values(THRESHOLDS)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("pins the model to a specific version, not an alias", () => {
    expect(ADAPTATION_MODEL).toMatch(/^jev-\d+\.\d+\.\d+$/);
    expect(ADAPTATION_MODEL).not.toMatch(/latest|preview/);
  });
});
