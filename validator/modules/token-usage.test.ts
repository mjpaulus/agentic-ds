// Section 3 of constraint-enforcement-spec.md pins the severity of
// raw-value violations inside token-usage: a color literal "is a rejection"
// and a border-radius literal "is a flag", regardless of the constraint's
// declared failureBehavior. These tests exist so neither direction can be
// laundered through failureBehavior again.

import { describe, expect, it } from "vitest";
import { Registry } from "../../registry/registry.js";
import { runStage3 } from "../stage3-constraints.js";
import type { ComponentDefinition, ConstraintEntry } from "../types.js";
import { checkTokenUsage } from "./token-usage.js";

function tokenUsageConstraint(failureBehavior: "reject" | "flag"): ConstraintEntry {
  return {
    id: "test-token-wall",
    type: "token-usage",
    rule: { allowedTiers: ["sem", "ctx"], consumesOnly: true },
    failureBehavior,
    rationale: "test rationale so flag is never treated as reject via Section 4",
  };
}

function definitionWith(constraint: ConstraintEntry): ComponentDefinition {
  return {
    name: "ds-test",
    version: "1.0.0",
    componentType: "atom",
    mutability: "adaptive",
    description: "token-usage severity test subject",
    api: { properties: [] },
    tokens: { consumes: ["--sem-color-action-bg", "--sem-radius-interactive"] },
    constraints: [constraint],
    provenance: { author: "human", createdAt: "2026-07-11T00:00:00Z" },
  } as ComponentDefinition;
}

describe("token-usage module-pinned severities", () => {
  it("marks a hex color literal severity reject and a border-radius px literal severity flag", () => {
    const constraint = tokenUsageConstraint("flag");
    const css = ".x { background: #ff0000; border-radius: 8px; color: var(--sem-color-action-bg); }";
    const { violations } = checkTokenUsage(definitionWith(constraint), css, constraint);

    const hex = violations.find((v) => v.message.includes("#ff0000"));
    const radius = violations.find((v) => v.message.includes("border-radius"));
    expect(hex?.severity).toBe("reject");
    expect(radius?.severity).toBe("flag");
  });

  it("rejects a hex color literal even when the constraint declares failureBehavior flag", () => {
    const constraint = tokenUsageConstraint("flag");
    const definition = definitionWith(constraint);
    const candidate = {
      definition,
      css: ".x { background: #ff0000; }",
      requestType: "register" as const,
    };

    const outcome = runStage3(candidate, definition, new Registry());
    expect(outcome.rejection).toBeDefined();
    expect(outcome.rejection?.message).toContain("#ff0000");
    expect(outcome.stageResult.passed).toBe(false);
  });

  it("flags a border-radius px literal even when the constraint declares failureBehavior reject", () => {
    const constraint = tokenUsageConstraint("reject");
    const definition = definitionWith(constraint);
    const candidate = {
      definition,
      css: ".x { border-radius: 8px; color: var(--sem-color-action-bg); }",
      requestType: "register" as const,
    };

    const outcome = runStage3(candidate, definition, new Registry());
    expect(outcome.rejection).toBeUndefined();
    expect(outcome.stageResult.passed).toBe(true);
    expect(outcome.warnings).toHaveLength(1);
    expect(outcome.warnings[0]?.message).toContain("border-radius");
  });
});
