// GENERATED — do not hand-edit; regenerate through the pipeline.
// Source definition: ds-text-input@1.0.0 (mutability: adaptive)
// Archetype: text-input. Regenerate via `npm run build:components`.

const TEMPLATE = "<input part=\"input\" type=\"text\" />";
const STYLE = ":host {\n  display: inline-block;\n  --_density-scale-ref: var(--ctx-density-scale);\n}\n\n[part=\"input\"] {\n  box-sizing: border-box;\n  width: 100%;\n  background: var(--sem-color-input-bg);\n  color: var(--sem-color-text-primary);\n  font: var(--sem-type-body);\n  padding: var(--sem-space-inset-control);\n  border-radius: var(--sem-radius-interactive);\n  border: var(--sem-border-control) solid var(--sem-color-input-border);\n}\n\n[part=\"input\"]:focus-visible {\n  border-color: var(--sem-color-input-border-focus);\n  outline: 2px solid var(--sem-color-focus-ring);\n  outline-offset: 1px;\n}\n\n:host([invalid]) [part=\"input\"] {\n  border-color: var(--sem-color-feedback-error);\n}\n\n[part=\"input\"]:disabled {\n  color: var(--sem-color-text-disabled);\n  cursor: not-allowed;\n}\n";
const ELEMENT_NAME = "ds-text-input";
const INPUT_EVENT = "ds-input";
const BLUR_EVENT = "ds-blur";

const PROP_SPECS = {
  "name": {"attr":"name","type":"string"},
  "value": {"attr":"value","type":"string","default":""},
  "placeholder": {"attr":"placeholder","type":"string"},
  "type": {"attr":"type","type":"string","default":"text","enum":["text","email","password"]},
  "disabled": {"attr":"disabled","type":"boolean","default":false},
  "invalid": {"attr":"invalid","type":"boolean","default":false}
};

class DsTextInput extends HTMLElement {
  static get observedAttributes() {
    return ["name", "value", "placeholder", "type", "disabled", "invalid"];
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
  Object.defineProperty(DsTextInput.prototype, propName, {
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

customElements.define(ELEMENT_NAME, DsTextInput);
export default DsTextInput;
