// The checkbox archetype: binary toggle backed by a native
// <input type="checkbox" part="input">. Same discipline as button.ts.
// Space/Enter toggles and fires ds-change (the sole declared event),
// suppressed when `this.disabled` is truthy -- matching native checkbox
// keyboard semantics rather than button.ts's generic activation-event
// convention (a checkbox's natural keyboard gesture already IS its one
// event, so no separate mapping is needed).

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
  return '<input part="input" type="checkbox" />';
}

function buildCss(definition: ComponentDefinition): string {
  const consumes = new Set(definition.tokens.consumes);
  const lines: string[] = [];

  lines.push(":host {");
  lines.push("  display: inline-flex;");
  lines.push("  align-items: center;");
  // Density is applied once, by the token pipeline's calc()-scaled dimension
  // tokens — a host transform would densify twice (see button.ts). Inert
  // passthrough keeps declared consumption checkable.
  if (consumes.has("--ctx-density-scale")) lines.push("  --_density-scale-ref: var(--ctx-density-scale);");
  lines.push("}");

  lines.push("");
  lines.push('[part="input"] {');
  lines.push("  appearance: none;");
  lines.push("  -webkit-appearance: none;");
  lines.push("  width: 1.1em;");
  lines.push("  height: 1.1em;");
  lines.push("  margin: 0;");
  lines.push("  cursor: pointer;");
  if (consumes.has("--sem-color-input-bg")) lines.push("  background: var(--sem-color-input-bg);");
  if (consumes.has("--sem-color-input-border") && consumes.has("--sem-border-control")) {
    lines.push("  border: var(--sem-border-control) solid var(--sem-color-input-border);");
  }
  if (consumes.has("--sem-radius-interactive")) lines.push("  border-radius: calc(var(--sem-radius-interactive) / 2);");
  lines.push("}");

  if (consumes.has("--sem-color-action-bg") && consumes.has("--sem-color-action-fg")) {
    lines.push("");
    lines.push('[part="input"]:checked {');
    lines.push("  background: var(--sem-color-action-bg);");
    lines.push("  border-color: var(--sem-color-action-bg);");
    lines.push("}");
  }

  if (consumes.has("--sem-color-focus-ring")) {
    lines.push("");
    lines.push('[part="input"]:focus-visible {');
    lines.push("  outline: 2px solid var(--sem-color-focus-ring);");
    lines.push("  outline-offset: 2px;");
    lines.push("}");
  }

  if (consumes.has("--sem-color-text-disabled")) {
    lines.push("");
    lines.push('[part="input"]:disabled {');
    lines.push("  cursor: not-allowed;");
    lines.push("  border-color: var(--sem-color-text-disabled);");
    lines.push("}");
  }

  return `${lines.join("\n")}\n`;
}

function buildSource(definition: ComponentDefinition, template: string, css: string): string {
  const properties = definition.api.properties;
  const events = definition.api.events ?? [];
  const changeEvent = events[0]?.name ?? "ds-change";
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
// Archetype: checkbox. Regenerate via \`npm run build:components\`.

const TEMPLATE = ${JSON.stringify(template)};
const STYLE = ${JSON.stringify(css)};
const ELEMENT_NAME = ${JSON.stringify(definition.name)};
const CHANGE_EVENT = ${JSON.stringify(changeEvent)};

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
    this._input.addEventListener("click", () => this._toggle());
    this._input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
        event.preventDefault();
        this._toggle();
      }
    });
  }

  connectedCallback() {
    this._reflectAll();
    if (!this.hasAttribute("aria-label")) {
      this.setAttribute("aria-label", this.name || "Checkbox");
    }
  }

  attributeChangedCallback() {
    this._reflectAll();
  }

  _toggle() {
    if (this.disabled) return;
    this.checked = !this.checked;
    this.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { checked: this.checked }, bubbles: true, composed: true }));
  }

  _reflectAll() {
    if (!this._input) return;
    this._input.checked = this.checked;
    this._input.disabled = this.disabled;
    if (this.name) this._input.name = this.name;
  }
}

for (const propName of Object.keys(PROP_SPECS)) {
  const spec = PROP_SPECS[propName];
  Object.defineProperty(${className}.prototype, propName, {
    get() {
      if (spec.type === "boolean") return this.hasAttribute(spec.attr);
      const raw = this.getAttribute(spec.attr);
      return raw === null ? spec.default : raw;
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

export function generateCheckboxComponent(definition: ComponentDefinition): GeneratedComponent {
  const template = buildTemplate();
  const css = buildCss(definition);
  const source = buildSource(definition, template, css);
  return { source, template, css };
}
