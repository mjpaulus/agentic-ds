import { describe, expect, it } from "vitest";
import { AA_CONTRAST_MIN, checkContrastPairs, contrastRatio, loadRealTokens } from "./contrast.js";
import type { ComponentDefinition } from "../types.js";
import type { TokensFile } from "../../tokens/types.js";

describe("contrastRatio: WCAG 2.1 relative-luminance math", () => {
  it("black on white is the maximum ratio, 21:1", () => {
    const ratio = contrastRatio("#000000", "#ffffff");
    expect(ratio).toBeCloseTo(21, 0);
  });

  it("a color against itself is the minimum ratio, 1:1", () => {
    const ratio = contrastRatio("#2563eb", "#2563eb");
    expect(ratio).toBeCloseTo(1, 5);
  });

  it("is symmetric regardless of argument order", () => {
    const a = contrastRatio("#2563eb", "#ffffff");
    const b = contrastRatio("#ffffff", "#2563eb");
    expect(a).toBeCloseTo(b as number, 10);
  });

  it("#767676 on white is the well-known ~4.5:1 AA boundary gray", () => {
    const ratio = contrastRatio("#767676", "#ffffff") as number;
    expect(ratio).toBeGreaterThan(4.4);
    expect(ratio).toBeLessThan(4.6);
  });

  it("returns undefined for an unparseable color", () => {
    expect(contrastRatio("not-a-color", "#ffffff")).toBeUndefined();
  });
});

describe("checkContrastPairs: real tokens.json", () => {
  it("ds-button's declared contrastPair tokens pass AA in both contexts", () => {
    const definition: ComponentDefinition = {
      name: "ds-button",
      version: "2.0.0",
      componentType: "atom",
      mutability: "adaptive",
      description: "test",
      api: { properties: [] },
      tokens: {
        consumes: ["--sem-color-action-bg", "--sem-color-action-fg", "--sem-color-danger-bg", "--sem-color-danger-fg"],
      },
      constraints: [],
      provenance: { author: "human", createdAt: "2026-07-11T00:00:00Z" },
    };
    const { violations, pairsChecked } = checkContrastPairs(definition, ["consumer-web", "enterprise-saas"]);
    expect(violations, `unexpected contrast violations: ${JSON.stringify(violations)}`).toHaveLength(0);
    // action-bg/action-fg and danger-bg/danger-fg, times 2 contexts = 4 pair-checks.
    expect(pairsChecked).toBe(4);
  });

  it("only checks pairs where the definition consumes at least one side", () => {
    const definition: ComponentDefinition = {
      name: "ds-nothing",
      version: "1.0.0",
      componentType: "atom",
      mutability: "generative",
      description: "test",
      api: { properties: [] },
      tokens: { consumes: ["--sem-radius-interactive"] },
      constraints: [],
      provenance: { author: "human", createdAt: "2026-07-11T00:00:00Z" },
    };
    const { violations, pairsChecked } = checkContrastPairs(definition, ["consumer-web", "enterprise-saas"]);
    expect(violations).toHaveLength(0);
    expect(pairsChecked).toBe(0);
  });

  it("loadRealTokens returns a cached, real TokensFile with sem.color-action-bg present", () => {
    const tokens = loadRealTokens();
    expect(tokens.sem["color-action-bg"]).toBeDefined();
  });
});

describe("checkContrastPairs: injectable synthetic token data", () => {
  const synthetic: TokensFile = {
    version: "test",
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
        pass: { $type: "color", $value: "#757575" },
        fail: { $type: "color", $value: "#aaaaaa" },
      },
    },
    sem: {
      "color-test-bg": { $type: "color", resolution: "{prim.color.white}" },
      "color-test-fg": {
        $type: "color",
        $extensions: { "ds.contrastPair": "color-test-bg" },
        resolution: { "consumer-web": "{prim.color.pass}", "enterprise-saas": "{prim.color.fail}" },
      },
    },
    ctx: { "consumer-web": {}, "enterprise-saas": {} },
  };

  it("finds a violation in exactly the failing context, using injected data instead of the real tokens.json", () => {
    const definition: ComponentDefinition = {
      name: "ds-synthetic",
      version: "1.0.0",
      componentType: "atom",
      mutability: "generative",
      description: "test",
      api: { properties: [] },
      tokens: { consumes: ["--sem-color-test-bg", "--sem-color-test-fg"] },
      constraints: [],
      provenance: { author: "human", createdAt: "2026-07-11T00:00:00Z" },
    };
    const { violations } = checkContrastPairs(definition, ["consumer-web", "enterprise-saas"], synthetic);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.context).toBe("enterprise-saas");
    expect(violations[0]?.ratio).toBeLessThan(AA_CONTRAST_MIN);
  });
});
