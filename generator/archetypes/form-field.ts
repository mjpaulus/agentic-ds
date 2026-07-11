// The form-field archetype: wraps a label slot + input slot, owns error
// display, and decides WHEN to validate by reading --ctx-validation-mode
// LIVE (never cached) at the moment validation would run. This is the P4c
// behavioral-token showcase (CLAUDE.md M4): the archetype itself contains
// zero context-name branching -- "eager"/"lazy" only ever appear as the
// literal string values already emitted into tokens.json's ctx block, read
// back at runtime, never compared against a context name.

import type { ApiSlot, ComponentDefinition } from "../../validator/types.js";
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

function buildTemplate(definition: ComponentDefinition): string {
  const slots: ApiSlot[] = definition.api.slots ?? [];
  const parts: string[] = ['<div part="container">'];
  for (const s of slots) parts.push(`<slot name="${s.name}"></slot>`);
  parts.push('<div part="error" role="alert"></div>');
  parts.push("</div>");
  return parts.join("");
}

function buildCss(definition: ComponentDefinition): string {
  const consumes = new Set(definition.tokens.consumes);
  const lines: string[] = [];

  lines.push(':host { display: block; }');
  lines.push("");
  lines.push('[part="container"] {');
  lines.push("  display: flex;");
  lines.push("  flex-direction: column;");
  if (consumes.has("--sem-space-gap-stack")) lines.push("  gap: calc(var(--sem-space-gap-stack) / 2);");
  lines.push("}");

  lines.push("");
  lines.push('[part="error"] {');
  lines.push("  display: none;");
  if (consumes.has("--sem-color-feedback-error")) lines.push("  color: var(--sem-color-feedback-error);");
  if (consumes.has("--sem-type-caption")) lines.push("  font: var(--sem-type-caption);");
  lines.push("}");
  lines.push("");
  lines.push('[part="error"][data-visible] {');
  lines.push("  display: block;");
  lines.push("}");

  return `${lines.join("\n")}\n`;
}

function buildSource(definition: ComponentDefinition, template: string, css: string): string {
  const properties = definition.api.properties;
  const slots: ApiSlot[] = definition.api.slots ?? [];
  const events = definition.api.events ?? [];
  const validateEvent = events[0]?.name ?? "ds-validate";
  const observedAttrs = properties.map((p) => JSON.stringify(toKebab(p.name)));
  const propSpecsEntries = properties.map((p) => {
    const attr = toKebab(p.name);
    const spec: Record<string, unknown> = { attr, type: p.type, default: p.default };
    if (p.enum) spec.enum = p.enum;
    return `  ${JSON.stringify(p.name)}: ${JSON.stringify(spec)}`;
  });
  const slotSpecsEntries = slots.map((s) => {
    const spec = s.allowedElements === undefined ? "undefined" : JSON.stringify(s.allowedElements);
    return `  ${JSON.stringify(s.name)}: { allowedElements: ${spec} }`;
  });
  const inputSlotName = slots.find((s) => s.name === "input")?.name ?? "input";
  const className = toClassName(definition.name);

  return `${HEADER}
// Source definition: ${definition.name}@${definition.version} (mutability: ${definition.mutability})
// Archetype: form-field. Regenerate via \`npm run build:components\`.

const TEMPLATE = ${JSON.stringify(template)};
const STYLE = ${JSON.stringify(css)};
const ELEMENT_NAME = ${JSON.stringify(definition.name)};
const VALIDATE_EVENT = ${JSON.stringify(validateEvent)};
const INPUT_SLOT_NAME = ${JSON.stringify(inputSlotName)};

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

    this._errorEl = shadow.querySelector('[part="error"]');
    this._blurWired = false;
    this._input = null;

    this._slotElements = Array.from(shadow.querySelectorAll("slot"));
    for (const slotEl of this._slotElements) {
      slotEl.addEventListener("slotchange", () => {
        this._checkSlot(slotEl);
        if (slotEl.getAttribute("name") === INPUT_SLOT_NAME) this._wireInput(slotEl);
      });
    }

    this.addEventListener("keydown", (event) => {
      if (this.disabled) return;
      if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
        event.preventDefault();
        this.validate();
      }
    });
  }

  connectedCallback() {
    queueMicrotask(() => {
      for (const slotEl of this._slotElements) {
        this._checkSlot(slotEl);
        if (slotEl.getAttribute("name") === INPUT_SLOT_NAME) this._wireInput(slotEl);
      }
    });
  }

  _wireInput(slotEl) {
    const assigned = slotEl.assignedElements ? slotEl.assignedElements() : [];
    const input = assigned[0];
    if (!input) return;
    this._input = input;
    if (!this._blurWired) {
      this._blurWired = true;
      input.addEventListener("blur", () => this._handleBlur());
    }
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
          ELEMENT_NAME + ': slot "' + slotName + '" does not allow <' + tag + '>. Allowed: [' +
          spec.allowedElements.join(", ") + "]."
        );
      }
    }
  }

  /**
   * Live read, per call, never cached -- CLAUDE.md M4 P4c: a context flip
   * must change behavior on the NEXT validation without any re-render or
   * reconstruction of this element.
   */
  _readValidationMode() {
    const raw = getComputedStyle(this).getPropertyValue("--ctx-validation-mode");
    return raw ? raw.trim() : "";
  }

  _isInvalid() {
    if (!this._input) return true;
    if (this._input.invalid === true || this._input.hasAttribute("invalid")) return true;
    if ("checked" in this._input) return false;
    const value = this._input.value !== undefined ? this._input.value : this._input.getAttribute("value") || "";
    return String(value).trim().length === 0;
  }

  _handleBlur() {
    if (this._readValidationMode() !== "eager") return;
    this._runValidation("eager");
  }

  /** Public: explicit validation, e.g. wired to a submit action. Returns true if valid. */
  validate() {
    const mode = this._readValidationMode() || "lazy";
    this._runValidation(mode);
    return !this._isInvalid();
  }

  _runValidation(mode) {
    const valid = !this._isInvalid();
    this._setErrorVisible(!valid);
    this.dispatchEvent(new CustomEvent(VALIDATE_EVENT, { detail: { valid, mode }, bubbles: true, composed: true }));
  }

  _setErrorVisible(visible) {
    if (!this._errorEl) return;
    if (visible) {
      this._errorEl.textContent = this.error || "This field is required.";
      this._errorEl.setAttribute("data-visible", "");
    } else {
      this._errorEl.textContent = "";
      this._errorEl.removeAttribute("data-visible");
    }
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

export function generateFormFieldComponent(definition: ComponentDefinition): GeneratedComponent {
  const template = buildTemplate(definition);
  const css = buildCss(definition);
  const source = buildSource(definition, template, css);
  return { source, template, css };
}
