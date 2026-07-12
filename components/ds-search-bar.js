// GENERATED — do not hand-edit; regenerate through the pipeline.
// Source definition: ds-search-bar@1.0.0 (mutability: adaptive)
// Archetype: search-bar. Regenerate via `npm run build:components`.

const TEMPLATE = "<input part=\"input\" type=\"text\" /><button type=\"button\" part=\"button\">Search</button>";
const STYLE = ":host {\n  display: inline-flex;\n  align-items: center;\n  gap: var(--sem-space-gap-related);\n  --_density-scale-ref: var(--ctx-density-scale);\n}\n\n[part=\"input\"] {\n  box-sizing: border-box;\n  background: var(--sem-color-input-bg);\n  font: var(--sem-type-body);\n  padding: var(--sem-space-inset-control);\n  border-radius: var(--sem-radius-interactive);\n  border: var(--sem-border-control) solid var(--sem-color-input-border);\n}\n\n[part=\"input\"]:focus-visible {\n  border-color: var(--sem-color-input-border-focus);\n  outline: 2px solid var(--sem-color-focus-ring);\n  outline-offset: 1px;\n}\n\n[part=\"button\"] {\n  border: none;\n  cursor: pointer;\n  background: var(--sem-color-action-bg);\n  color: var(--sem-color-action-fg);\n  font: var(--sem-type-control);\n  padding: var(--sem-space-inset-control);\n  border-radius: var(--sem-radius-interactive);\n  transition-duration: var(--ctx-motion-duration);\n  transition-property: background-color;\n}\n\n[part=\"button\"]:hover {\n  background: var(--sem-color-action-bg-hover);\n}\n\n[part=\"button\"]:focus-visible {\n  outline: 2px solid var(--sem-color-focus-ring);\n  outline-offset: 2px;\n}\n";
const ELEMENT_NAME = "ds-search-bar";
const SEARCH_EVENT = "ds-search";

const PROP_SPECS = {
  "placeholder": {"attr":"placeholder","type":"string","default":"Search"}
};

class DsSearchBar extends HTMLElement {
  static get observedAttributes() {
    return ["placeholder"];
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
  Object.defineProperty(DsSearchBar.prototype, propName, {
    get() {
      const raw = this.getAttribute(spec.attr);
      return raw === null ? spec.default : raw;
    },
    set(value) {
      this.setAttribute(spec.attr, String(value));
    },
  });
}

customElements.define(ELEMENT_NAME, DsSearchBar);
export default DsSearchBar;
