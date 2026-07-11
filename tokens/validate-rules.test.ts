import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseTokens } from "./parser.js";
import { validateRules } from "./validate-rules.js";
import type { TokensFile } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPECS_PATH = resolve(__dirname, "../specs/tokens.json");

function loadBaseline(): TokensFile {
  return parseTokens(SPECS_PATH);
}

function deepClone<T>(value: T): T {
  return structuredClone(value);
}

describe("P1a: completeness validation", () => {
  it("throws naming the token and missing context when a per-context sem token's resolution is missing a context (color-action-bg / enterprise-saas)", () => {
    const data = deepClone(loadBaseline());
    delete (data.sem["color-action-bg"]!.resolution as Record<string, unknown>)[
      "enterprise-saas"
    ];
    expect(() => validateRules(data)).toThrowError();
    try {
      validateRules(data);
      throw new Error("expected validateRules to throw");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain("color-action-bg");
      expect(message).toContain("enterprise-saas");
    }
  });

  it("throws naming the token and missing context when a per-context sem token's resolution is missing a context (radius-interactive / consumer-web)", () => {
    const data = deepClone(loadBaseline());
    delete (data.sem["radius-interactive"]!.resolution as Record<string, unknown>)[
      "consumer-web"
    ];
    try {
      validateRules(data);
      throw new Error("expected validateRules to throw");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain("radius-interactive");
      expect(message).toContain("consumer-web");
    }
  });

  it("throws naming the token and missing context for a composite typography token missing a context key (type-control / enterprise-saas)", () => {
    const data = deepClone(loadBaseline());
    delete (data.sem["type-control"]!.resolution as Record<string, unknown>)[
      "enterprise-saas"
    ];
    try {
      validateRules(data);
      throw new Error("expected validateRules to throw");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain("type-control");
      expect(message).toContain("enterprise-saas");
    }
  });

  it("does not throw on the untouched baseline data", () => {
    const data = deepClone(loadBaseline());
    expect(() => validateRules(data)).not.toThrow();
  });
});

describe("reference resolution failures", () => {
  it("throws an error containing the offending path when a sem token references a nonexistent prim token", () => {
    const data = deepClone(loadBaseline());
    data.sem["color-action-fg"]!.resolution = "{prim.color.blue.999}";
    expect(() => validateRules(data)).toThrowError(/prim\.color\.blue\.999/);
  });

  it("throws when a prim token references another token instead of holding a literal", () => {
    const data = deepClone(loadBaseline());
    (data.prim.color as Record<string, unknown>) = {
      ...(data.prim.color as Record<string, unknown>),
    };
    const blue = (data.prim as unknown as { color: { blue: Record<string, { $value: unknown }> } })
      .color.blue;
    blue["600"]!.$value = "{prim.color.blue.700}";
    expect(() => validateRules(data)).toThrow();
  });
});
