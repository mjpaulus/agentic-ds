// GENERATED — do not hand-edit; regenerate through the pipeline.
// Source definition: ds-label@1.0.0 (mutability: adaptive)
// Archetype: label. Regenerate via `npm run build:components`.

const TEMPLATE = "<span><slot></slot><span part=\"required-marker\" aria-hidden=\"true\"></span></span>";
const STYLE = ":host {\n  display: inline-flex;\n  align-items: center;\n  gap: var(--sem-space-gap-related);\n  font: var(--sem-type-label);\n  color: var(--sem-color-text-primary);\n}\n\n:host([required]) [part=\"required-marker\"]::before {\n  content: \" *\";\n  color: var(--sem-color-feedback-error);\n}\n";
const ELEMENT_NAME = "ds-label";

const PROP_SPECS = {
  "for": {"attr":"for","type":"string"},
  "required": {"attr":"required","type":"boolean","default":false}
};

class DsLabel extends HTMLElement {
  static get observedAttributes() {
    return ["for", "required"];
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
  Object.defineProperty(DsLabel.prototype, propName, {
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

customElements.define(ELEMENT_NAME, DsLabel);
export default DsLabel;
