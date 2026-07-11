import { describe, expect, it } from "vitest";
import { Registry, RegistryIntegrityError, type RegistryEntry } from "./registry.js";
import type { ComponentDefinition, ValidationRecord } from "../validator/types.js";

function baseDefinition(overrides: Partial<ComponentDefinition> = {}): ComponentDefinition {
  return {
    name: "ds-invariant-test",
    version: "1.0.0",
    componentType: "atom",
    mutability: "generative",
    description: "test",
    api: { properties: [] },
    tokens: { consumes: ["--sem-color-test-bg"] },
    constraints: [
      {
        id: "token-wall",
        type: "token-usage",
        rule: { allowedTiers: ["sem", "ctx"], consumesOnly: true },
        failureBehavior: "reject",
      },
    ],
    provenance: { author: "human", createdAt: "2026-07-11T00:00:00Z" },
    ...overrides,
  };
}

function passingRecord(): ValidationRecord {
  return {
    candidateName: "ds-invariant-test",
    passed: true,
    outcome: "registered",
    stages: [],
    warnings: [],
    timestamp: new Date().toISOString(),
  };
}

function entryFor(definition: ComponentDefinition): RegistryEntry {
  return {
    name: definition.name,
    version: definition.version,
    definition,
    apiSignatureHash: "irrelevant-for-this-test",
    validationRecord: passingRecord(),
    flagged: false,
    registeredAt: new Date().toISOString(),
  };
}

describe("Registry incumbent invariant", () => {
  it("throws RegistryIntegrityError when a single write would create two incumbents for the same context", () => {
    const registry = new Registry();
    const definition = baseDefinition({
      variants: [
        { name: "a", status: "incumbent", contextPreference: ["consumer-web"] },
        { name: "b", status: "incumbent", contextPreference: ["consumer-web"] },
      ],
    });
    expect(() => registry.register(entryFor(definition))).toThrow(RegistryIntegrityError);
  });

  it("allows one incumbent per distinct context", () => {
    const registry = new Registry();
    const definition = baseDefinition({
      variants: [
        { name: "a", status: "incumbent", contextPreference: ["consumer-web"] },
        { name: "b", status: "incumbent", contextPreference: ["enterprise-saas"] },
      ],
    });
    expect(() => registry.register(entryFor(definition))).not.toThrow();
    expect(registry.get("ds-invariant-test")).toBeDefined();
  });

  it("allows an incumbent alongside a challenger in the same context", () => {
    const registry = new Registry();
    const definition = baseDefinition({
      variants: [
        { name: "a", status: "incumbent", contextPreference: ["consumer-web"] },
        { name: "b", status: "challenger", contextPreference: ["consumer-web"] },
      ],
    });
    expect(() => registry.register(entryFor(definition))).not.toThrow();
  });

  it("does not mutate registry state when the invariant check throws", () => {
    const registry = new Registry();
    const definition = baseDefinition({
      variants: [
        { name: "a", status: "incumbent", contextPreference: ["consumer-web"] },
        { name: "b", status: "incumbent", contextPreference: ["consumer-web"] },
      ],
    });
    expect(() => registry.register(entryFor(definition))).toThrow(RegistryIntegrityError);
    expect(registry.has("ds-invariant-test")).toBe(false);
  });
});

describe("Registry basic operations", () => {
  it("has/get/isComposable behave for registered vs unregistered vs flagged", () => {
    const registry = new Registry();
    const okDef = baseDefinition({ name: "ds-ok" });
    registry.register(entryFor(okDef));
    expect(registry.has("ds-ok")).toBe(true);
    expect(registry.isComposable("ds-ok")).toBe(true);
    expect(registry.isComposable("ds-missing")).toBe(false);

    const flaggedDef = baseDefinition({ name: "ds-flagged" });
    const flaggedEntry = { ...entryFor(flaggedDef), flagged: true };
    registry.register(flaggedEntry);
    expect(registry.has("ds-flagged")).toBe(true);
    expect(registry.isComposable("ds-flagged")).toBe(false);
  });
});
