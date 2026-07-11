import { describe, expect, it } from "vitest";
import { dsButtonCandidate } from "../test/helpers.js";
import { runStage4 } from "./stage4-rendered.js";
import type { Candidate, ComponentDefinition } from "./types.js";

function baseDefinition(overrides: Partial<ComponentDefinition> = {}): ComponentDefinition {
  return {
    name: "ds-probe",
    version: "1.0.0",
    componentType: "atom",
    mutability: "generative",
    description: "test",
    api: { properties: [] },
    tokens: { consumes: [] },
    constraints: [],
    provenance: { author: "human", createdAt: "2026-07-11T00:00:00Z" },
    ...overrides,
  };
}

describe("Stage 4: artifact gating", () => {
  it("defers (passes) when no source artifact is present and no accessibility constraint is declared", async () => {
    const definition = baseDefinition({
      constraints: [{ id: "tw", type: "token-usage", rule: {}, failureBehavior: "reject" }],
    });
    const outcome = await runStage4({ definition, requestType: "register" }, definition);
    expect(outcome.rejection).toBeUndefined();
    expect(outcome.stageResult.passed).toBe(true);
    expect(outcome.stageResult.notes.some((n) => n.includes("deferred"))).toBe(true);
  });

  it("rejects when an accessibility constraint is declared but no source artifact is present", async () => {
    const definition = baseDefinition({
      constraints: [
        {
          id: "a11y-check",
          type: "accessibility",
          rule: { rules: ["button-name"] },
          failureBehavior: "reject",
        },
      ],
    });
    const outcome = await runStage4({ definition, requestType: "register" }, definition);
    expect(outcome.rejection).toBeDefined();
    expect(outcome.rejection?.constraintId).toBe("a11y-check");
    expect(outcome.rejection?.message).toContain("no generated source artifact");
  });
});

describe("Stage 4: ds-button rendered verification (P4-partial)", () => {
  it("passes both contexts independently and records contrast/keyboard/perf/slot notes", async () => {
    const candidate = dsButtonCandidate();
    const definition = candidate.definition as ComponentDefinition;
    const outcome = await runStage4(candidate, definition);

    expect(outcome.rejection, `unexpected rejection: ${JSON.stringify(outcome.rejection)}`).toBeUndefined();
    expect(outcome.stageResult.passed).toBe(true);

    for (const context of ["consumer-web", "enterprise-saas"]) {
      expect(outcome.stageResult.notes.some((n) => n.includes(`contrast (${context})`))).toBe(true);
      expect(outcome.stageResult.notes.some((n) => n.includes(`keyboard operability (${context})`))).toBe(true);
      expect(outcome.stageResult.notes.some((n) => n.includes(`perf (${context})`))).toBe(true);
      expect(outcome.stageResult.notes.some((n) => n.includes(`slot probe (${context}`))).toBe(true);
    }
  });

  it("perf notes report numeric render/interaction/bundle measurements", async () => {
    const candidate = dsButtonCandidate();
    const definition = candidate.definition as ComponentDefinition;
    const outcome = await runStage4(candidate, definition);
    const perfNote = outcome.stageResult.notes.find((n) => n.includes("perf (consumer-web)"));
    expect(perfNote).toBeDefined();
    expect(perfNote).toMatch(/render=[\d.]+ms interaction=[\d.]+ms bundle=[\d.]+kb/);
  });
});

describe("Stage 4: keyboard operability probe catches a broken activation handler", () => {
  const BROKEN_SOURCE = `
class DsBrokenKeyboard extends HTMLElement {
  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    shadow.innerHTML = '<button type="button"><slot></slot></button>';
    // Deliberately does NOT wire keydown -> activation event.
  }
}
customElements.define("ds-broken-keyboard", DsBrokenKeyboard);
export default DsBrokenKeyboard;
`;

  it("rejects when synthetic Enter/Space keydown never fires the declared event", async () => {
    const definition = baseDefinition({
      name: "ds-broken-keyboard",
      api: {
        properties: [],
        events: [{ name: "ds-press" }],
      },
      constraints: [
        // rules: [] — this test isolates the keyboard probe; button-name is exercised separately.
        { id: "a11y-kb", type: "accessibility", rule: { rules: [] }, failureBehavior: "reject" },
      ],
    });
    const candidate: Candidate = { definition, requestType: "register", source: BROKEN_SOURCE };
    const outcome = await runStage4(candidate, definition);
    expect(outcome.rejection).toBeDefined();
    expect(outcome.rejection?.module).toBe("stage4-accessibility-keyboard");
    expect(outcome.rejection?.message).toContain("did not fire");
  });
});

describe("Stage 4: composition slot probe", () => {
  const BROKEN_SLOT_SOURCE = `
class DsBrokenSlot extends HTMLElement {
  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    shadow.innerHTML = '<div><slot name="icon"></slot></div>';
  }
  connectedCallback() {
    // Deliberately does not enforce the icon slot's empty allowedElements.
  }
}
customElements.define("ds-broken-slot", DsBrokenSlot);
export default DsBrokenSlot;
`;

  it("rejects when disallowed slot content does not trigger a console error", async () => {
    const definition = baseDefinition({
      name: "ds-broken-slot",
      api: {
        properties: [],
        slots: [{ name: "icon", allowedElements: [] }],
      },
      constraints: [
        { id: "slot-check", type: "composition", rule: { enforceSlotContent: true }, failureBehavior: "reject" },
      ],
    });
    const candidate: Candidate = { definition, requestType: "register", source: BROKEN_SLOT_SOURCE };
    const outcome = await runStage4(candidate, definition);
    expect(outcome.rejection).toBeDefined();
    expect(outcome.rejection?.module).toBe("stage4-composition");
    expect(outcome.rejection?.sourceSpan).toBe("slot:icon");
  });
});
