// The search-bar archetype: composes an internal text field and trigger
// button as this component's OWN shadow parts (::part(input)/::part(button))
// rather than nested ds-text-input/ds-button custom-element instances -- see
// definitions/ds-search-bar.definition.json's provenance.justification for
// why (breaking a circular registration dependency with ds-button, which is
// locked and already requires ds-search-bar to be pre-registered). Fires
// ds-search on Enter in the input or trigger-button press.

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
  return '<input part="input" type="text" /><button type="button" part="button">Search</button>';
}

function buildCss(definition: ComponentDefinition): string {
  const consumes = new Set(definition.tokens.consumes);
  const lines: string[] = [];

  lines.push(":host {");
  lines.push("  display: inline-flex;");
  lines.push("  align-items: center;");
  if (consumes.has("--sem-space-gap-related")) lines.push("  gap: var(--sem-space-gap-related);");
  // Density is applied once, by the token pipeline's calc()-scaled dimension
  // tokens — a host transform would densify twice (see button.ts). Inert
  // passthrough keeps declared consumption checkable.
  if (consumes.has("--ctx-density-scale")) lines.push("  --_density-scale-ref: var(--ctx-density-scale);");
  lines.push("}");

  lines.push("");
  lines.push('[part="input"] {');
  lines.push("  box-sizing: border-box;");
  if (consumes.has("--sem-color-input-bg")) lines.push("  background: var(--sem-color-input-bg);");
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

  lines.push("");
  lines.push('[part="button"] {');
  lines.push("  border: none;");
  lines.push("  cursor: pointer;");
  if (consumes.has("--sem-color-action-bg")) lines.push("  background: var(--sem-color-action-bg);");
  if (consumes.has("--sem-color-action-fg")) lines.push("  color: var(--sem-color-action-fg);");
  if (consumes.has("--sem-type-control")) lines.push("  font: var(--sem-type-control);");
  if (consumes.has("--sem-space-inset-control")) lines.push("  padding: var(--sem-space-inset-control);");
  if (consumes.has("--sem-radius-interactive")) lines.push("  border-radius: var(--sem-radius-interactive);");
  if (consumes.has("--ctx-motion-duration")) {
    lines.push("  transition-duration: var(--ctx-motion-duration);");
    lines.push("  transition-property: background-color;");
  }
  lines.push("}");

  if (consumes.has("--sem-color-action-bg-hover")) {
    lines.push("");
    lines.push('[part="button"]:hover {');
    lines.push("  background: var(--sem-color-action-bg-hover);");
    lines.push("}");
  }

  if (consumes.has("--sem-color-focus-ring")) {
    lines.push("");
    lines.push('[part="button"]:focus-visible {');
    lines.push("  outline: 2px solid var(--sem-color-focus-ring);");
    lines.push("  outline-offset: 2px;");
    lines.push("}");
  }

  return `${lines.join("\n")}\n`;
}

function buildSource(definition: ComponentDefinition, template: string, css: string): string {
  const properties = definition.api.properties;
  const events = definition.api.events ?? [];
  const searchEvent = events[0]?.name ?? "ds-search";
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
// Archetype: search-bar. Regenerate via \`npm run build:components\`.

const TEMPLATE = ${JSON.stringify(template)};
const STYLE = ${JSON.stringify(css)};
const ELEMENT_NAME = ${JSON.stringify(definition.name)};
const SEARCH_EVENT = ${JSON.stringify(searchEvent)};

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

    this._input = shadow.querySelector('[part="input"]');
    this._button = shadow.querySelector('[part="button"]');

    this._input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this._fireSearch();
      }
    });
    this._button.addEventListener("click", () => this._fireSearch());
    this._button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
        event.preventDefault();
        this._fireSearch();
      }
    });
  }

  connectedCallback() {
    this._reflectAll();
    if (!this.hasAttribute("aria-label")) {
      this.setAttribute("aria-label", this.placeholder || "Search");
    }
  }

  attributeChangedCallback() {
    this._reflectAll();
  }

  _fireSearch() {
    if (this.disabled) return;
    this.dispatchEvent(
      new CustomEvent(SEARCH_EVENT, { detail: { query: this._input.value }, bubbles: true, composed: true })
    );
  }

  _reflectAll() {
    if (!this._input) return;
    this._input.placeholder = this.placeholder || "Search";
  }
}

for (const propName of Object.keys(PROP_SPECS)) {
  const spec = PROP_SPECS[propName];
  Object.defineProperty(${className}.prototype, propName, {
    get() {
      const raw = this.getAttribute(spec.attr);
      return raw === null ? spec.default : raw;
    },
    set(value) {
      this.setAttribute(spec.attr, String(value));
    },
  });
}

customElements.define(ELEMENT_NAME, ${className});
export default ${className};
`;
}

export function generateSearchBarComponent(definition: ComponentDefinition): GeneratedComponent {
  const template = buildTemplate();
  const css = buildCss(definition);
  const source = buildSource(definition, template, css);
  return { source, template, css };
}
