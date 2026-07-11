// The label archetype: text + optional `for` association + required marker.
// No events, no interaction -- deterministic template literal assembly,
// same discipline as generator/archetypes/button.ts.

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
  return '<span><slot></slot><span part="required-marker" aria-hidden="true"></span></span>';
}

function buildCss(definition: ComponentDefinition): string {
  const consumes = new Set(definition.tokens.consumes);
  const lines: string[] = [];

  lines.push(":host {");
  lines.push("  display: inline-flex;");
  lines.push("  align-items: center;");
  if (consumes.has("--sem-space-gap-related")) lines.push("  gap: var(--sem-space-gap-related);");
  if (consumes.has("--sem-type-label")) lines.push("  font: var(--sem-type-label);");
  if (consumes.has("--sem-color-text-primary")) lines.push("  color: var(--sem-color-text-primary);");
  lines.push("}");

  if (consumes.has("--sem-color-feedback-error")) {
    lines.push("");
    lines.push(':host([required]) [part="required-marker"]::before {');
    lines.push('  content: " *";');
    lines.push("  color: var(--sem-color-feedback-error);");
    lines.push("}");
  }

  return `${lines.join("\n")}\n`;
}

function buildSource(definition: ComponentDefinition, template: string, css: string): string {
  const properties = definition.api.properties;
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
// Archetype: label. Regenerate via \`npm run build:components\`.

const TEMPLATE = ${JSON.stringify(template)};
const STYLE = ${JSON.stringify(css)};
const ELEMENT_NAME = ${JSON.stringify(definition.name)};

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
  }

  connectedCallback() {
    this._reflectFor();
  }

  attributeChangedCallback(name) {
    if (name === "for") this._reflectFor();
  }

  _reflectFor() {
    // Reflects the semantic association for real DOM consumers even though
    // the shadow content has nothing to associate with directly (a light-DOM
    // label-target pattern; ds-form-field is the composed consumer of this).
    if (this.for) this.setAttribute("data-for", this.for);
    else this.removeAttribute("data-for");
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

export function generateLabelComponent(definition: ComponentDefinition): GeneratedComponent {
  const template = buildTemplate();
  const css = buildCss(definition);
  const source = buildSource(definition, template, css);
  return { source, template, css };
}
