// GENERATED — do not hand-edit; regenerate through the pipeline.
// Source definition: ds-badge@1.0.0 (mutability: adaptive)
// Archetype: badge. Regenerate via `npm run build:components`.

const TEMPLATE = "<slot></slot>";
const STYLE = ":host {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  padding: calc(var(--sem-space-inset-control) / 2) var(--sem-space-inset-control);\n  border-radius: var(--sem-radius-interactive);\n  font: var(--sem-type-caption);\n  background: var(--sem-color-emphasis-bg);\n  color: var(--sem-color-emphasis-fg);\n  --_density-scale-ref: var(--ctx-density-scale);\n}\n\n:host([variant=\"success\"]) {\n  background: var(--sem-color-surface-bg);\n  color: var(--sem-color-feedback-success);\n}\n\n:host([variant=\"error\"]) {\n  background: var(--sem-color-surface-bg);\n  color: var(--sem-color-feedback-error);\n}\n";
const ELEMENT_NAME = "ds-badge";

const PROP_SPECS = {
  "variant": {"attr":"variant","type":"string","default":"info","enum":["info","success","error"]}
};

const SLOT_SPECS = {
  "": { allowedElements: [] }
};

class DsBadge extends HTMLElement {
  static get observedAttributes() {
    return ["variant"];
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
  Object.defineProperty(DsBadge.prototype, propName, {
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

customElements.define(ELEMENT_NAME, DsBadge);
export default DsBadge;
