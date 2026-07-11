// The button archetype: the only archetype that exists in M3
// (generator/generate.ts selects it from definition.usage.designPatterns /
// name). Deterministic template literal assembly — no LLM involvement here;
// AI generates *definitions* (M5), this module turns a validated definition
// into a self-contained Web Component ES module string. Same definition in
// -> byte-identical output out (structural hash depends on it).

import type { ApiSlot, ComponentDefinition } from "../../validator/types.js";
import type { GeneratedComponent } from "../generate.js";

const HEADER = "// GENERATED — do not hand-edit; regenerate through the pipeline.";

/** camelCase property name -> kebab-case attribute name. */
function toKebab(name: string): string {
  return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

// -----------------------------------------------------------------------
// Template
// -----------------------------------------------------------------------

/**
 * Slot ordering design call: the button archetype places a named "icon"
 * slot (if declared) before the unnamed "default" slot (label text), then
 * any further named slots in declaration order. The definition's "default"
 * API slot maps to the DOM's unnamed slot (no `slot` attribute required on
 * assigned content); every other named API slot maps to a DOM slot with a
 * matching `name` attribute.
 */
function buildTemplate(definition: ComponentDefinition): string {
  const slots: ApiSlot[] = definition.api.slots ?? [];
  const iconSlot = slots.find((s) => s.name === "icon");
  const defaultSlot = slots.find((s) => s.name === "default");
  const otherSlots = slots.filter((s) => s.name !== "icon" && s.name !== "default");

  const parts: string[] = [];
  if (iconSlot) parts.push('<slot name="icon"></slot>');
  if (defaultSlot) parts.push("<slot></slot>");
  for (const s of otherSlots) parts.push(`<slot name="${s.name}"></slot>`);

  return `<button type="button">${parts.join("")}</button>`;
}

// -----------------------------------------------------------------------
// CSS — every declaration below is gated on the token actually being
// present in definition.tokens.consumes, so the generator never emits a
// var() reference that the M2 token-usage module would reject as
// undeclared. No raw literals anywhere (the wall is unconditional).
// -----------------------------------------------------------------------

function buildCss(definition: ComponentDefinition): string {
  const consumes = new Set(definition.tokens.consumes);
  const lines: string[] = [];

  lines.push(":host {");
  lines.push("  display: inline-flex;");
  lines.push("  align-items: center;");
  lines.push("  justify-content: center;");
  lines.push("  border: none;");
  lines.push("  cursor: pointer;");
  if (consumes.has("--sem-space-inset-control")) {
    lines.push("  gap: var(--sem-space-inset-control);");
    lines.push("  padding: var(--sem-space-inset-control);");
  }
  if (consumes.has("--sem-radius-interactive")) {
    lines.push("  border-radius: var(--sem-radius-interactive);");
  }
  if (consumes.has("--sem-type-control")) {
    lines.push("  font: var(--sem-type-control);");
  }
  if (consumes.has("--sem-color-action-bg")) {
    lines.push("  background: var(--sem-color-action-bg);");
  }
  if (consumes.has("--sem-color-action-fg")) {
    lines.push("  color: var(--sem-color-action-fg);");
  }
  if (consumes.has("--ctx-motion-duration")) {
    lines.push("  transition-duration: var(--ctx-motion-duration);");
    lines.push("  transition-property: background-color, transform, opacity;");
  }
  if (consumes.has("--ctx-density-scale")) {
    lines.push("  transform: scale(var(--ctx-density-scale));");
  }
  lines.push("}");

  lines.push("");
  lines.push(":host([disabled]) {");
  lines.push("  opacity: 0.5;");
  lines.push("  cursor: not-allowed;");
  lines.push("}");

  lines.push("");
  lines.push(":host([loading]) {");
  lines.push("  cursor: progress;");
  lines.push("}");

  if (consumes.has("--sem-color-action-bg-hover")) {
    lines.push("");
    lines.push(":host(:hover:not([disabled]):not([loading])) {");
    lines.push("  background: var(--sem-color-action-bg-hover);");
    lines.push("}");
  }

  if (consumes.has("--sem-color-focus-ring")) {
    lines.push("");
    lines.push(":host(:focus-visible) {");
    lines.push("  outline: 2px solid var(--sem-color-focus-ring);");
    lines.push("  outline-offset: 2px;");
    lines.push("}");
  }

  if (consumes.has("--sem-color-danger-bg") && consumes.has("--sem-color-danger-fg")) {
    lines.push("");
    lines.push(':host([variant="danger"]) {');
    lines.push("  background: var(--sem-color-danger-bg);");
    lines.push("  color: var(--sem-color-danger-fg);");
    lines.push("}");
  }

  lines.push("");
  lines.push("slot {");
  lines.push("  display: inline-flex;");
  lines.push("  align-items: center;");
  lines.push("}");

  return `${lines.join("\n")}\n`;
}

// -----------------------------------------------------------------------
// Source (the custom element class module)
// -----------------------------------------------------------------------

function buildSource(definition: ComponentDefinition, template: string, css: string): string {
  const properties = definition.api.properties;
  const slots: ApiSlot[] = definition.api.slots ?? [];
  const events = definition.api.events ?? [];
  // Design call: the first declared event is treated as "the activation
  // event" fired on click/keyboard press. This is hardcoded archetype
  // behavior (not parsed from any prose field) — CLAUDE.md rule #6.
  const activationEvent = events[0]?.name ?? "ds-press";

  const propSpecsEntries = properties.map((p) => {
    const attr = toKebab(p.name);
    const spec: Record<string, unknown> = { attr, type: p.type, default: p.default };
    if (p.enum) spec.enum = p.enum;
    return `  ${JSON.stringify(p.name)}: ${JSON.stringify(spec)}`;
  });

  const slotSpecsEntries = slots.map((s) => {
    const key = s.name === "default" ? "" : s.name;
    const spec = s.allowedElements === undefined ? "undefined" : JSON.stringify(s.allowedElements);
    return `  ${JSON.stringify(key)}: { allowedElements: ${spec} }`;
  });

  const observedAttrs = properties.map((p) => JSON.stringify(toKebab(p.name)));

  return `${HEADER}
// Source definition: ${definition.name}@${definition.version} (mutability: ${definition.mutability})
// Archetype: button. Regenerate via \`npm run build:components\`.

const TEMPLATE = ${JSON.stringify(template)};
const STYLE = ${JSON.stringify(css)};
const ELEMENT_NAME = ${JSON.stringify(definition.name)};
const ACTIVATION_EVENT = ${JSON.stringify(activationEvent)};

const PROP_SPECS = {
${propSpecsEntries.join(",\n")}
};

const SLOT_SPECS = {
${slotSpecsEntries.join(",\n")}
};

class ${toClassName(definition.name)} extends HTMLElement {
  static get observedAttributes() {
    return [${observedAttrs.join(", ")}];
  }

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    const template = document.createElement("template");
    template.innerHTML = "<style>" + STYLE + "</style>" + TEMPLATE;
    shadow.appendChild(template.content.cloneNode(true));

    this._button = shadow.querySelector("button");
    if (this._button) {
      this._button.addEventListener("click", (event) => this._handleActivate(event));
      this._button.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
          event.preventDefault();
          this._handleActivate(event);
        }
      });
    }

    // Slot enforcement (constraint-enforcement-spec.md Section 3,
    // "composition"): a slotchange listener catches future dynamic content
    // changes; the initial check runs from connectedCallback (deferred to a
    // microtask — slot assignment is not guaranteed synchronous immediately
    // after connection in every DOM implementation).
    this._slotElements = Array.from(shadow.querySelectorAll("slot"));
    for (const slotEl of this._slotElements) {
      slotEl.addEventListener("slotchange", () => this._checkSlot(slotEl));
    }
  }

  connectedCallback() {
    this._reflectDisabledState();
    queueMicrotask(() => {
      for (const slotEl of this._slotElements) this._checkSlot(slotEl);
    });
  }

  attributeChangedCallback(name) {
    if (name === "disabled" || name === "loading") this._reflectDisabledState();
  }

  _reflectDisabledState() {
    if (this._button) this._button.disabled = this.disabled;
  }

  _checkSlot(slotEl) {
    const slotName = slotEl.getAttribute("name") || "";
    const spec = SLOT_SPECS[slotName];
    if (!spec || spec.allowedElements === undefined) return; // unrestricted
    const assigned = slotEl.assignedElements ? slotEl.assignedElements() : [];
    for (const el of assigned) {
      const tag = el.tagName.toLowerCase();
      if (!spec.allowedElements.includes(tag)) {
        console.error(
          ELEMENT_NAME + ': slot "' + (slotName || "default") + '" does not allow <' + tag + '>. Allowed: [' +
          (spec.allowedElements.join(", ") || "text only") + "]."
        );
      }
    }
  }

  _handleActivate(originalEvent) {
    if (this.disabled || this.loading) return;
    this.dispatchEvent(
      new CustomEvent(ACTIVATION_EVENT, {
        detail: { originalEvent },
        bubbles: true,
        composed: true,
      })
    );
  }

  get closestContext() {
    const el = this.closest("[data-context]");
    if (el) return el.getAttribute("data-context");
    return document.documentElement.getAttribute("data-context");
  }
}

for (const propName of Object.keys(PROP_SPECS)) {
  const spec = PROP_SPECS[propName];
  Object.defineProperty(${toClassName(definition.name)}.prototype, propName, {
    get() {
      if (spec.type === "boolean") return this.hasAttribute(spec.attr);
      const raw = this.getAttribute(spec.attr);
      if (raw === null) return spec.default;
      if (spec.type === "number") {
        const n = Number(raw);
        if (Number.isNaN(n)) {
          console.error(ELEMENT_NAME + ': invalid numeric value "' + raw + '" for property "' + propName + '"; falling back to default.');
          return spec.default;
        }
        return n;
      }
      if (spec.enum && !spec.enum.includes(raw)) {
        console.error(ELEMENT_NAME + ': invalid value "' + raw + '" for property "' + propName + '"; falling back to default "' + spec.default + '".');
        return spec.default;
      }
      return raw;
    },
    set(value) {
      if (spec.type === "boolean") {
        if (value) this.setAttribute(spec.attr, "");
        else this.removeAttribute(spec.attr);
      } else {
        this.setAttribute(spec.attr, String(value));
      }
    },
  });
}

customElements.define(ELEMENT_NAME, ${toClassName(definition.name)});
export default ${toClassName(definition.name)};
`;
}

/** "ds-button" -> "DsButton". Deterministic, no collisions within this POC's naming convention. */
function toClassName(elementName: string): string {
  return elementName
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

export function generateButtonComponent(definition: ComponentDefinition): GeneratedComponent {
  const template = buildTemplate(definition);
  const css = buildCss(definition);
  const source = buildSource(definition, template, css);
  return { source, template, css };
}
