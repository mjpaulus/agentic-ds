import { describe, expect, it } from "vitest";
import { loadJson } from "../../test/helpers.js";
import { validateUsage } from "./api-stability.js";
import type { ComponentDefinition } from "../types.js";

describe("validateUsage against ds-button's variant enum", () => {
  const definition = loadJson("../specs/ds-button.definition.json") as ComponentDefinition;

  it("accepts an allowed enum value", () => {
    const result = validateUsage(definition, { variant: "danger" });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects a value outside the enum", () => {
    const result = validateUsage(definition, { variant: "ghost" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("variant"))).toBe(true);
  });

  it("rejects a type mismatch", () => {
    const result = validateUsage(definition, { disabled: "yes" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("disabled"))).toBe(true);
  });

  it("rejects an unknown property", () => {
    const result = validateUsage(definition, { flavor: "primary" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("flavor"))).toBe(true);
  });
});
