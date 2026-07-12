// The badge archetype: inert text chip, three color variants via foreground
// only. No events, no interaction. Same discipline as button.ts/label.ts.

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
  return "<slot></slot>";
}

function buildCss(definition: ComponentDefinition): string {
  const consumes = new Set(definition.tokens.consumes);
  const lines: string[] = [];

  lines.push(":host {");
  lines.push("  display: inline-flex;");
  lines.push("  align-items: center;");
  lines.push("  justify-content: center;");
  if (consumes.has("--sem-space-inset-control")) lines.push("  padding: calc(var(--sem-space-inset-control) / 2) var(--sem-space-inset-control);");
  if (consumes.has("--sem-radius-interactive")) lines.push("  border-radius: var(--sem-radius-interactive);");
  if (consumes.has("--sem-type-caption")) lines.push("  font: var(--sem-type-caption);");
  if (consumes.has("--sem-color-emphasis-bg")) lines.push("  background: var(--sem-color-emphasis-bg);");
  if (consumes.has("--sem-color-emphasis-fg")) lines.push("  color: var(--sem-color-emphasis-fg);");
  // Density is applied once, by the token pipeline's calc()-scaled dimension
  // tokens — a host transform would densify twice (see button.ts). Inert
  // passthrough keeps declared consumption checkable.
  if (consumes.has("--ctx-density-scale")) lines.push("  --_density-scale-ref: var(--ctx-density-scale);");
  lines.push("}");

  if (consumes.has("--sem-color-surface-bg") && consumes.has("--sem-color-feedback-success")) {
    lines.push("");
    lines.push(':host([variant="success"]) {');
    lines.push("  background: var(--sem-color-surface-bg);");
    lines.push("  color: var(--sem-color-feedback-success);");
    lines.push("}");
  }
  if (consumes.has("--sem-color-surface-bg") && consumes.has("--sem-color-feedback-error")) {
    lines.push("");
    lines.push(':host([variant="error"]) {');
    lines.push("  background: var(--sem-color-surface-bg);");
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
  const slots = definition.api.slots ?? [];
  const slotSpecsEntries = slots.map((s) => {
    const key = s.name === "default" ? "" : s.name;
    const spec = s.allowedElements === undefined ? "undefined" : JSON.stringify(s.allowedElements);
    return `  ${JSON.stringify(key)}: { allowedElements: ${spec} }`;
  });
  const className = toClassName(definition.name);

  return `${HEADER}
// Source definition: ${definition.name}@${definition.version} (mutability: ${definition.mutability})
// Archetype: badge. Regenerate via \`npm run build:components\`.

const TEMPLATE = ${JSON.stringify(template)};
const STYLE = ${JSON.stringify(css)};
const ELEMENT_NAME = ${JSON.stringify(definition.name)};

const PROP_SPECS = {
${propSpecsEntries.join(",\n")}
};

const SLOT_SPECS = {
${slotSpecsEntries.join(",\n")}
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

    this._slotElements = Array.from(shadow.querySelectorAll("slot"));
    for (const slotEl of this._slotElements) {
      slotEl.addEventListener("slotchange", () => this._checkSlot(slotEl));
    }
  }

  connectedCallback() {
    queueMicrotask(() => {
      for (const slotEl of this._slotElements) this._checkSlot(slotEl);
    });
  }

  _checkSlot(slotEl) {
    const slotName = slotEl.getAttribute("name") || "";
    const spec = SLOT_SPECS[slotName];
    if (!spec || spec.allowedElements === undefined) return;
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

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === "variant") {
      const spec = PROP_SPECS.variant;
      if (spec && spec.enum && newValue !== null && !spec.enum.includes(newValue)) {
        console.error(ELEMENT_NAME + ': invalid value "' + newValue + '" for property "variant"; falling back to default "' + spec.default + '".');
      }
    }
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

export function generateBadgeComponent(definition: ComponentDefinition): GeneratedComponent {
  const template = buildTemplate();
  const css = buildCss(definition);
  const source = buildSource(definition, template, css);
  return { source, template, css };
}
