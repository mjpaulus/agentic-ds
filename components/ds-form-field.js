// GENERATED — do not hand-edit; regenerate through the pipeline.
// Source definition: ds-form-field@1.0.0 (mutability: adaptive)
// Archetype: form-field. Regenerate via `npm run build:components`.

const TEMPLATE = "<div part=\"container\"><slot name=\"label\"></slot><slot name=\"input\"></slot><div part=\"error\" role=\"alert\"></div></div>";
const STYLE = ":host { display: block; }\n\n[part=\"container\"] {\n  display: flex;\n  flex-direction: column;\n  gap: calc(var(--sem-space-gap-stack) / 2);\n}\n\n[part=\"error\"] {\n  display: none;\n  color: var(--sem-color-feedback-error);\n  font: var(--sem-type-caption);\n}\n\n[part=\"error\"][data-visible] {\n  display: block;\n}\n";
const ELEMENT_NAME = "ds-form-field";
const VALIDATE_EVENT = "ds-validate";
const INPUT_SLOT_NAME = "input";

const PROP_SPECS = {
  "name": {"attr":"name","type":"string"},
  "label": {"attr":"label","type":"string"},
  "error": {"attr":"error","type":"string"}
};

const SLOT_SPECS = {
  "label": { allowedElements: ["ds-label"] },
  "input": { allowedElements: ["ds-text-input","ds-checkbox"] }
};

class DsFormField extends HTMLElement {
  static get observedAttributes() {
    return ["name", "label", "error"];
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
  Object.defineProperty(DsFormField.prototype, propName, {
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

customElements.define(ELEMENT_NAME, DsFormField);
export default DsFormField;
