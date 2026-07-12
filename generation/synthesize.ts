// The M5 generic fallback for novel (archetype-less) AI-authored
// definitions. Documented design call (CLAUDE.md M5 brief): novel components
// coming out of generateDefinition have no hand-authored archetype in
// generator/archetypes, so generator/generate.ts's selectArchetype() has
// nothing to dispatch to. Rather than fabricate a bespoke archetype per
// requirement (which would defeat the point of testing the AI's OWN
// definitions against the real pipeline), the P3 flow synthesizes two
// minimal, mechanical, token-honest artifacts directly from the definition:
//
//   synthesizeCss(definition)    — a :host block using ONLY var() references
//                                   built from tokens.consumes, no layout
//                                   claims beyond "this token maps to this
//                                   CSS property by naming convention."
//   synthesizeSource(definition) — a generic custom element: shadow DOM,
//                                   the synthesized CSS, mechanical
//                                   attribute<->property reflection for
//                                   api.properties, and slot-content
//                                   checking for api.slots (same
//                                   console.error-on-disallowed-content
//                                   contract every archetype uses, so Stage
//                                   4's composition probe has something real
//                                   to exercise).
//
// This is a deliberate scope cut, not an attempt to make every novel
// definition pass: it is intentionally "dumb" (no bespoke a11y wiring, e.g.
// it never infers that a `label` property should become `aria-label`), so
// definitions that lean on that kind of archetype-specific intelligence
// legitimately fail Stage 4 against it. See test/generation/results.md.

import type { ComponentDefinition } from "../validator/types.js";

function toKebab(name: string): string {
  return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

function toClassName(elementName: string): string {
  return elementName
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/**
 * A plain token-only :host CSS block from tokens.consumes. Deterministic:
 * the CSS property each token maps to is derived purely from the token's
 * name (a naming-convention lookup, not a design decision), so the same
 * definition always synthesizes the same CSS. Every var() reference comes
 * from tokens.consumes, so this can never itself trip the primitive wall or
 * the consumes-only check — those checks then only ever catch a BAD
 * tokens.consumes declaration, not a synthesis mistake.
 */
export function synthesizeCss(definition: ComponentDefinition): string {
  const lines: string[] = [":host {", "  display: inline-flex;", "  align-items: center;"];

  for (const token of definition.tokens.consumes) {
    const bare = token.replace(/^--(sem|ctx)-/, "");
    if (/-bg$/.test(bare)) {
      lines.push(`  background: var(${token});`);
    } else if (/^color-/.test(bare)) {
      lines.push(`  color: var(${token});`);
    } else if (/^space-inset/.test(bare)) {
      lines.push(`  padding: var(${token});`);
    } else if (/^space-gap/.test(bare)) {
      lines.push(`  gap: var(${token});`);
    } else if (/^radius-/.test(bare)) {
      lines.push(`  border-radius: var(${token});`);
    } else if (/^type-/.test(bare)) {
      lines.push(`  font: var(${token});`);
    } else if (/^border-/.test(bare)) {
      lines.push(`  border-width: var(${token});`);
    } else if (bare === "motion-duration") {
      lines.push(`  transition-duration: var(${token});`);
    } else {
      // Unrecognized-shape token (e.g. a behavioral/numeric ctx token like
      // density-scale): still referenced, via a harmless custom-property
      // passthrough, so the definition's stated consumption is real and
      // checkable rather than declared-but-unused.
      const safe = bare.replace(/[^a-z0-9-]/g, "-");
      lines.push(`  --_${safe}-ref: var(${token});`);
    }
  }

  lines.push("}");
  return `${lines.join("\n")}\n`;
}

/**
 * A generic, mechanical Web Component source: mirrors the shape every
 * archetype in generator/archetypes/*.ts already produces (shadow DOM,
 * PROP_SPECS-driven attribute<->property reflection, slot-content
 * console.error probing), but with no component-specific behavior at all —
 * see this file's header for why that's a deliberate honesty cut, not an
 * oversight.
 */
export function synthesizeSource(definition: ComponentDefinition): string {
  const css = synthesizeCss(definition);
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
  const template = "<slot></slot>";

  return `// GENERATED (generic fallback synthesis) — do not hand-edit.
// Source definition: ${definition.name}@${definition.version} (mutability: ${definition.mutability})
// Synthesized by generation/synthesize.ts: no bespoke archetype exists for
// this novel, AI-authored component. See that file's header comment.

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

  attributeChangedCallback() {}
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
