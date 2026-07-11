// Hand-authored, generated-shaped fixture: a deliberately BROKEN component.
// Its definition (slot-content-violation.json) declares an "icon" slot with
// allowedElements: [] (text only), but this implementation never checks
// slotted content against that allowlist. Stage 4's slot probe must catch
// the mismatch between the declared contract and the actual runtime
// behavior — this is the fixture that proves it does.
class DsSlotViolation extends HTMLElement {
  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    shadow.innerHTML = '<div><slot name="icon"></slot></div>';
  }
  connectedCallback() {
    // Deliberately does nothing: no slot-content enforcement.
  }
}
customElements.define("ds-slot-violation", DsSlotViolation);
export default DsSlotViolation;
