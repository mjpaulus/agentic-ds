import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkTokenUsage } from "../validator/modules/token-usage.js";
import type { ComponentDefinition, ConstraintEntry } from "../validator/types.js";
import { generateComponent } from "./generate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadDsButton(): ComponentDefinition {
  return JSON.parse(readFileSync(resolve(__dirname, "../specs/ds-button.definition.json"), "utf-8")) as ComponentDefinition;
}

describe("generator determinism", () => {
  it("generates byte-identical output across repeated calls for the same definition", () => {
    const definition = loadDsButton();
    const a = generateComponent(definition);
    const b = generateComponent(definition);
    expect(a.source).toBe(b.source);
    expect(a.template).toBe(b.template);
    expect(a.css).toBe(b.css);
  });

  it("carries the 'do not hand-edit' header on every emitted artifact", () => {
    const generated = generateComponent(loadDsButton());
    expect(generated.source).toContain("GENERATED — do not hand-edit; regenerate through the pipeline.");
  });

  it("generated CSS passes the M2 token-usage module directly (only declared sem/ctx tokens, no raw literals)", () => {
    const definition = loadDsButton();
    const generated = generateComponent(definition);
    const constraint = definition.constraints.find((c) => c.type === "token-usage") as ConstraintEntry;
    const result = checkTokenUsage(definition, generated.css, constraint);
    expect(result.violations, `unexpected token-usage violations: ${JSON.stringify(result.violations)}`).toHaveLength(0);
  });

  it("throws a clear, named error for a definition with no matching archetype", () => {
    const definition = loadDsButton();
    const unknownArchetype: ComponentDefinition = {
      ...definition,
      name: "ds-mystery-thing",
      usage: { contexts: ["consumer-web"], designPatterns: ["something-unrecognized"] },
    };
    expect(() => generateComponent(unknownArchetype)).toThrow(/no archetype registered for definition "ds-mystery-thing"/);
  });

  it("emits a template whose structural shape matches the declared slots (icon before default)", () => {
    const generated = generateComponent(loadDsButton());
    expect(generated.template).toBe('<button type="button"><slot name="icon"></slot><slot></slot></button>');
  });
});
