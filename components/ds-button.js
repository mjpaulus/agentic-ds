// GENERATED — do not hand-edit; regenerate through the pipeline.
// ds-button@2.1.0 (adaptive, archetype: button)

const TEMPLATE = "<button type=\"button\"><slot name=\"icon\"></slot><slot></slot></button>";
const STYLE = ":host{display:inline-flex;align-items:center;justify-content:center;border:none;cursor:pointer;gap:var(--sem-space-inset-control);padding:var(--sem-space-inset-control);border-radius:var(--sem-radius-interactive);font:var(--sem-type-control);background:var(--sem-color-action-bg);color:var(--sem-color-action-fg);transition-duration:var(--ctx-motion-duration);transition-property:background-color,color,opacity;--_density-scale-ref:var(--ctx-density-scale);}button{all:unset;display:inline-flex;align-items:center;gap:inherit;font:inherit;color:inherit;cursor:inherit;}:host([disabled]){opacity:0.5;cursor:not-allowed;}:host([loading]){cursor:progress;}:host(:hover:not([disabled]):not([loading])){background:var(--sem-color-action-bg-hover);}:host(:focus-within:has(button:focus-visible)){outline:2px solid var(--sem-color-focus-ring);outline-offset:2px;}:host([variant=\"danger\"]){background:var(--sem-color-danger-bg);color:var(--sem-color-danger-fg);}:host([variant=\"secondary\"]){background:var(--sem-color-emphasis-bg);color:var(--sem-color-emphasis-fg);}:host([variant=\"secondary\"]:hover:not([disabled]):not([loading])){background:var(--sem-color-emphasis-fg);color:var(--sem-color-emphasis-bg);}slot{display:inline-flex;align-items:center;}";
const ELEMENT_NAME = "ds-button";
const ACTIVATION_EVENT = "ds-press";

const PROP_SPECS = {
  "variant": {"attr":"variant","type":"string","default":"primary","enum":["primary","secondary","danger"]},
  "size": {"attr":"size","type":"string","default":"medium","enum":["small","medium","large"]},
  "disabled": {"attr":"disabled","type":"boolean","default":false},
  "loading": {"attr":"loading","type":"boolean","default":false}
};

const SLOT_SPECS = {
  "": { allowedElements: ["ds-badge"] },
  "icon": { allowedElements: [] }
};

class DsButton extends HTMLElement {
  static get observedAttributes() {
    return ["variant", "size", "disabled", "loading"];
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
  Object.defineProperty(DsButton.prototype, propName, {
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

customElements.define(ELEMENT_NAME, DsButton);
export default DsButton;
