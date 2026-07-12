// GENERATED — do not hand-edit; regenerate through the pipeline.
// Source definition: ds-checkbox@1.0.0 (mutability: adaptive)
// Archetype: checkbox. Regenerate via `npm run build:components`.

const TEMPLATE = "<input part=\"input\" type=\"checkbox\" />";
const STYLE = ":host {\n  display: inline-flex;\n  align-items: center;\n  --_density-scale-ref: var(--ctx-density-scale);\n}\n\n[part=\"input\"] {\n  appearance: none;\n  -webkit-appearance: none;\n  width: 1.1em;\n  height: 1.1em;\n  margin: 0;\n  cursor: pointer;\n  background: var(--sem-color-input-bg);\n  border: var(--sem-border-control) solid var(--sem-color-input-border);\n  border-radius: calc(var(--sem-radius-interactive) / 2);\n}\n\n[part=\"input\"]:checked {\n  background: var(--sem-color-action-bg);\n  border-color: var(--sem-color-action-bg);\n}\n\n[part=\"input\"]:focus-visible {\n  outline: 2px solid var(--sem-color-focus-ring);\n  outline-offset: 2px;\n}\n\n[part=\"input\"]:disabled {\n  cursor: not-allowed;\n  border-color: var(--sem-color-text-disabled);\n}\n";
const ELEMENT_NAME = "ds-checkbox";
const CHANGE_EVENT = "ds-change";

const PROP_SPECS = {
  "name": {"attr":"name","type":"string"},
  "checked": {"attr":"checked","type":"boolean","default":false},
  "disabled": {"attr":"disabled","type":"boolean","default":false}
};

class DsCheckbox extends HTMLElement {
  static get observedAttributes() {
    return ["name", "checked", "disabled"];
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
  Object.defineProperty(DsCheckbox.prototype, propName, {
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

customElements.define(ELEMENT_NAME, DsCheckbox);
export default DsCheckbox;
