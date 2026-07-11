// Hand-authored, generated-shaped fixture standing in for a real generator
// archetype (ds-contrast-violation isn't a button; M3 only has the button
// archetype). Structurally valid and inert — its only job is to give Stage 4
// something to instantiate so the contrast module (token-data math, not
// rendering) has a live definition to check against.
class DsContrastViolation extends HTMLElement {
  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    shadow.innerHTML = "<style>:host{background:var(--sem-color-test-bg);color:var(--sem-color-test-fg);}</style><span><slot></slot></span>";
  }
}
customElements.define("ds-contrast-violation", DsContrastViolation);
export default DsContrastViolation;
