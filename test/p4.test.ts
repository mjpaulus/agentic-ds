// P4 (Adaptation) exit criteria, success-criteria.md:
//   (a) zero per-context component code, all variation flows through token
//       bindings and behavioral ctx tokens
//   (b) axe-core-equivalent a11y + contrast passes in BOTH contexts
//       independently for all seven components
//   (c) validation-mode demonstrably changes Form Field behavior (blur
//       validation in enterprise, submit validation in consumer), driven
//       only by the ctx token.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";
import { generateComponent } from "../generator/generate.js";
import { Registry } from "../registry/registry.js";
import { loadDefinition, registerAllComponents } from "./helpers.js";

const ALL_SEVEN = ["ds-label", "ds-badge", "ds-text-input", "ds-checkbox", "ds-form-field", "ds-search-bar", "ds-button"];
const CONTEXT_NAMES = ["consumer-web", "enterprise-saas"];

describe("P4a: all seven components register through the full pipeline", () => {
  it("registers every component with outcome 'registered' (zero warnings)", async () => {
    const registry = new Registry();
    const records = await registerAllComponents(registry);
    for (const name of ALL_SEVEN) {
      const record = records[name];
      expect(record, `missing record for ${name}`).toBeDefined();
      expect(record?.passed, `${name} did not pass: ${JSON.stringify(record?.rejection)}`).toBe(true);
      expect(record?.outcome, `${name} outcome`).toBe("registered");
      expect(registry.has(name)).toBe(true);
    }
  });

  it("generated sources contain zero occurrences of context names (machine-checkable proxy for zero per-context component code)", () => {
    for (const name of ALL_SEVEN) {
      const definition = loadDefinition(name);
      const generated = generateComponent(definition);
      for (const contextName of CONTEXT_NAMES) {
        expect(generated.source.includes(contextName), `${name} source contains "${contextName}"`).toBe(false);
      }
    }
  });
});

describe("P4b: Stage 4 a11y + contrast pass in both contexts independently, for all seven", () => {
  for (const name of ALL_SEVEN) {
    it(`${name}: Stage 4 passes and records contrast + a11y notes for both contexts`, async () => {
      const registry = new Registry();
      await registerAllComponents(registry);
      const record = registry.get(name)?.validationRecord;
      expect(record, `no validation record for ${name}`).toBeDefined();

      const stage4 = record?.stages.find((s) => s.stage === 4);
      expect(stage4, `${name} has no Stage 4 result`).toBeDefined();
      expect(stage4?.passed, `${name} Stage 4 failed`).toBe(true);

      for (const context of CONTEXT_NAMES) {
        expect(
          stage4?.notes.some((n) => n.includes(`contrast (${context})`)),
          `${name}: expected a contrast note for ${context}, got notes: ${JSON.stringify(stage4?.notes)}`
        ).toBe(true);
      }
    });
  }
});

describe("P4c: ds-form-field validation-mode is driven only by the ctx token", () => {
  function buildFieldEnvironment(context: string): { window: InstanceType<typeof Window>; document: Document; field: Element; input: Element } {
    const window = new Window();
    const document = window.document as unknown as Document;
    document.documentElement.setAttribute("data-context", context);

    // Same happy-dom custom-property-inheritance shim Stage 4 uses (see
    // validator/stage4-rendered.ts) -- happy-dom does not implement custom
    // property INHERITANCE in getComputedStyle, only direct-rule resolution,
    // so this duplicates the context block onto a universal-selector rule.
    const distPath = new URL("../tokens/dist/context-" + context + ".css", import.meta.url);
    const tokenCss = readFileSyncUrl(distPath);
    const shimDecls = Array.from(tokenCss.matchAll(/(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/g))
      .map((m) => `${m[1]}: ${m[2]};`)
      .join(" ");
    const styleEl = document.createElement("style");
    styleEl.textContent = `${tokenCss}\n* { ${shimDecls} }`;
    document.head.appendChild(styleEl);

    const labelDef = loadDefinition("ds-label");
    const inputDef = loadDefinition("ds-text-input");
    const fieldDef = loadDefinition("ds-form-field");

    evaluate(generateComponent(labelDef).source, window, document);
    evaluate(generateComponent(inputDef).source, window, document);
    evaluate(generateComponent(fieldDef).source, window, document);

    const field = document.createElement("ds-form-field");
    const input = document.createElement("ds-text-input");
    input.setAttribute("slot", "input");
    input.setAttribute("name", "email");
    field.appendChild(input);
    document.body.appendChild(field);

    return { window, document, field, input };
  }

  function evaluate(source: string, window: InstanceType<typeof Window>, document: Document): void {
    const body = source.replace(/\nexport default \w+;\s*$/, "\n");
    const fn = new Function("window", "document", "customElements", "HTMLElement", "CustomEvent", "console", "queueMicrotask", body);
    const win = window as unknown as { customElements: CustomElementRegistry; HTMLElement: typeof HTMLElement; CustomEvent: typeof CustomEvent };
    fn(window, document, win.customElements, win.HTMLElement, win.CustomEvent, console, queueMicrotask);
  }

  function readFileSyncUrl(url: URL): string {
    return readFileSync(fileURLToPath(url), "utf-8");
  }

  async function flush(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
  }

  it("enterprise-saas (eager): blur on an empty required input shows the error and fires ds-validate({valid:false, mode:'eager'})", async () => {
    const { field, input } = buildFieldEnvironment("enterprise-saas");
    await flush();

    let detail: { valid: boolean; mode: string } | undefined;
    field.addEventListener("ds-validate", (e) => {
      detail = (e as CustomEvent).detail;
    });

    input.dispatchEvent(new Event("blur"));

    expect(detail, "ds-validate did not fire on blur in eager mode").toBeDefined();
    expect(detail?.valid).toBe(false);
    expect(detail?.mode).toBe("eager");

    const errorPart = field.shadowRoot?.querySelector('[part="error"]');
    expect(errorPart?.hasAttribute("data-visible")).toBe(true);
  });

  it("consumer-web (lazy): the SAME blur does not validate; the difference is only the data-context attribute", async () => {
    const { field, input } = buildFieldEnvironment("consumer-web");
    await flush();

    let fired = false;
    field.addEventListener("ds-validate", () => {
      fired = true;
    });

    input.dispatchEvent(new Event("blur"));

    expect(fired, "ds-validate fired on blur in lazy mode; blur must not validate in consumer-web").toBe(false);
    const errorPart = field.shadowRoot?.querySelector('[part="error"]');
    expect(errorPart?.hasAttribute("data-visible")).toBe(false);
  });

  it("consumer-web (lazy): an explicit validate() call (the submit path) validates and reports mode 'lazy'", async () => {
    const { field } = buildFieldEnvironment("consumer-web");
    await flush();

    let detail: { valid: boolean; mode: string } | undefined;
    field.addEventListener("ds-validate", (e) => {
      detail = (e as CustomEvent).detail;
    });

    const valid = (field as unknown as { validate(): boolean }).validate();

    expect(valid).toBe(false);
    expect(detail?.mode).toBe("lazy");
    const errorPart = field.shadowRoot?.querySelector('[part="error"]');
    expect(errorPart?.hasAttribute("data-visible")).toBe(true);
  });
});

describe("Determinism: all seven archetypes generate byte-identical output across repeated calls", () => {
  for (const name of ALL_SEVEN) {
    it(`${name}: repeated generateComponent() calls are byte-identical`, () => {
      const definition = loadDefinition(name);
      const a = generateComponent(definition);
      const b = generateComponent(definition);
      expect(a.source).toBe(b.source);
      expect(a.template).toBe(b.template);
      expect(a.css).toBe(b.css);
    });
  }
});
