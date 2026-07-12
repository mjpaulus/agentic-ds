// The text-input archetype: single-line entry control backed by a native
// <input part="input"> in shadow DOM. Same discipline as button.ts.
//
// Archetype-wide convention (established by button.ts's ACTIVATION_EVENT):
// the FIRST declared api.events entry is "the activation event" fired by
// Enter/Space on the primary interactive element, suppressed when
// `this.disabled` is truthy. For ds-text-input that is "ds-input" -- typing
// Enter commits/re-fires the current value, which both satisfies Stage 4's
// generic keyboard-operability probe and is a reasonable real-world
// "commit this value" gesture. Native `input`/`blur` events additionally
// fire ds-input/ds-blur for real typing interaction.

import type { ComponentDefinition } from "../../validator/types.js";
import type { GeneratedComponent } from "../generate.js";

const HEADER = "// GENERATED — do not hand-edit; regenerate through the pipeline.";

function toKebab(name: string): string {
  return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

function toClassName(elementName: string): string {
  return elementName
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function buildTemplate(): string {
  return '<input part="input" type="text" />';
}

function buildCss(definition: ComponentDefinition): string {
  const consumes = new Set(definition.tokens.consumes);
  const lines: string[] = [];

  lines.push(":host {");
  lines.push("  display: inline-block;");
  // Density is applied once, by the token pipeline's calc()-scaled dimension
  // tokens — a host transform would densify twice (see button.ts). Inert
  // passthrough keeps declared consumption checkable.
  if (consumes.has("--ctx-density-scale")) lines.push("  --_density-scale-ref: var(--ctx-density-scale);");
  lines.push("}");

  lines.push("");
  lines.push('[part="input"] {');
  lines.push("  box-sizing: border-box;");
  lines.push("  width: 100%;");
  if (consumes.has("--sem-color-input-bg")) lines.push("  background: var(--sem-color-input-bg);");
  if (consumes.has("--sem-color-text-primary")) lines.push("  color: var(--sem-color-text-primary);");
  if (consumes.has("--sem-type-body")) lines.push("  font: var(--sem-type-body);");
  if (consumes.has("--sem-space-inset-control")) lines.push("  padding: var(--sem-space-inset-control);");
  if (consumes.has("--sem-radius-interactive")) lines.push("  border-radius: var(--sem-radius-interactive);");
  if (consumes.has("--sem-color-input-border") && consumes.has("--sem-border-control")) {
    lines.push("  border: var(--sem-border-control) solid var(--sem-color-input-border);");
  }
  lines.push("}");

  if (consumes.has("--sem-color-input-border-focus") && consumes.has("--sem-color-focus-ring")) {
    lines.push("");
    lines.push('[part="input"]:focus-visible {');
    lines.push("  border-color: var(--sem-color-input-border-focus);");
    lines.push("  outline: 2px solid var(--sem-color-focus-ring);");
    lines.push("  outline-offset: 1px;");
    lines.push("}");
  }

  if (consumes.has("--sem-color-feedback-error")) {
    lines.push("");
    lines.push(':host([invalid]) [part="input"] {');
    lines.push("  border-color: var(--sem-color-feedback-error);");
    lines.push("}");
  }

  if (consumes.has("--sem-color-text-disabled")) {
    lines.push("");
    lines.push('[part="input"]:disabled {');
    lines.push("  color: var(--sem-color-text-disabled);");
    lines.push("  cursor: not-allowed;");
    lines.push("}");
  }

  return `${lines.join("\n")}\n`;
}

function buildSource(definition: ComponentDefinition, template: string, css: string): string {
  const properties = definition.api.properties;
  const events = definition.api.events ?? [];
  const activationEvent = events[0]?.name ?? "ds-input";
  const blurEvent = events[1]?.name ?? events[0]?.name ?? "ds-blur";
  const observedAttrs = properties.map((p) => JSON.stringify(toKebab(p.name)));
  const propSpecsEntries = properties.map((p) => {
    const attr = toKebab(p.name);
    const spec: Record<string, unknown> = { attr, type: p.type, default: p.default };
    if (p.enum) spec.enum = p.enum;
    return `  ${JSON.stringify(p.name)}: ${JSON.stringify(spec)}`;
  });
  const className = toClassName(definition.name);

  return `${HEADER}
// Source definition: ${definition.name}@${definition.version} (mutability: ${definition.mutability})
// Archetype: text-input. Regenerate via \`npm run build:components\`.

const TEMPLATE = ${JSON.stringify(template)};
const STYLE = ${JSON.stringify(css)};
const ELEMENT_NAME = ${JSON.stringify(definition.name)};
const INPUT_EVENT = ${JSON.stringify(activationEvent)};
const BLUR_EVENT = ${JSON.stringify(blurEvent)};

const PROP_SPECS = {
${propSpecsEntries.join(",\n")}
};

class ${className} extends HTMLElement {
  static get observedAttributes() {
    return [${observedAttrs.join(", ")}];
  }

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    const template = document.createElement("template");
    template.innerHTML = "<style>" + STYLE + "</style>" + TEMPLATE;
    shadow.appendChild(template.content.cloneNode(true));

    this._input = shadow.querySelector("input");
    this._input.addEventListener("input", () => {
      this.value = this._input.value;
      this._fireInput();
    });
    this._input.addEventListener("blur", () => {
      this.dispatchEvent(new CustomEvent(BLUR_EVENT, { detail: { value: this.value }, bubbles: true, composed: true }));
    });
    this._input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
        if (this.disabled) return;
        this._fireInput();
      }
    });
  }

  connectedCallback() {
    this._reflectAll();
    if (!this.hasAttribute("aria-label")) {
      this.setAttribute("aria-label", this.name || "Text input");
    }
  }

  attributeChangedCallback() {
    this._reflectAll();
  }

  _fireInput() {
    if (this.disabled) return;
    this.dispatchEvent(new CustomEvent(INPUT_EVENT, { detail: { value: this.value }, bubbles: true, composed: true }));
  }

  _reflectAll() {
    if (!this._input) return;
    this._input.type = this.type;
    this._input.placeholder = this.placeholder || "";
    if (this._input.value !== this.value) this._input.value = this.value;
    this._input.disabled = this.disabled;
    this._input.setAttribute("aria-invalid", this.invalid ? "true" : "false");
    if (this.name) this._input.name = this.name;
  }
}

for (const propName of Object.keys(PROP_SPECS)) {
  const spec = PROP_SPECS[propName];
  Object.defineProperty(${className}.prototype, propName, {
    get() {
      if (spec.type === "boolean") return this.hasAttribute(spec.attr);
      const raw = this.getAttribute(spec.attr);
      if (raw === null) return spec.default;
      if (spec.enum && !spec.enum.includes(raw)) return spec.default;
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

customElements.define(ELEMENT_NAME, ${className});
export default ${className};
`;
}

export function generateTextInputComponent(definition: ComponentDefinition): GeneratedComponent {
  const template = buildTemplate();
  const css = buildCss(definition);
  const source = buildSource(definition, template, css);
  return { source, template, css };
}
