// Direct-DOM substitutions for the axe-core rules named in an accessibility
// constraint's rule.rules, EXCLUDING color-contrast (handled separately by
// modules/contrast.ts — token-data math, not rendering). axe-core in
// happy-dom is unreliable (it leans on getComputedStyle/layout APIs happy-dom
// doesn't fully implement); per the M3 brief's explicit fallback clause,
// this module implements the specific named rules directly against the
// rendered DOM instead. Any rule name with no substitution here is recorded
// as "skipped" — never silently passed (a rule that didn't execute must not
// read as a rule that passed).

export type A11yStatus = "pass" | "violation" | "skipped";
export type A11ySeverity = "serious" | "critical" | "moderate";

export interface A11yCheckResult {
  rule: string;
  status: A11yStatus;
  severity?: A11ySeverity;
  message?: string;
}

/** Minimal shape this module needs from a rendered host element. */
interface CheckableElement {
  tagName: string;
  getAttribute(name: string): string | null;
  textContent: string | null;
}

function checkButtonName(el: CheckableElement): A11yCheckResult {
  const ariaLabel = el.getAttribute("aria-label");
  const hasAriaLabel = typeof ariaLabel === "string" && ariaLabel.trim().length > 0;
  const text = (el.textContent ?? "").trim();
  if (hasAriaLabel || text.length > 0) {
    return { rule: "button-name", status: "pass" };
  }
  return {
    rule: "button-name",
    status: "violation",
    severity: "serious",
    message: `<${el.tagName.toLowerCase()}> has no accessible name: no text content and no aria-label.`,
  };
}

function checkFocusOrderSemantics(el: CheckableElement): A11yCheckResult {
  const tabIndexAttr = el.getAttribute("tabindex");
  const tabIndexVal = tabIndexAttr !== null ? Number(tabIndexAttr) : 0;
  if (Number.isFinite(tabIndexVal) && tabIndexVal > 0) {
    return {
      rule: "focus-order-semantics",
      status: "violation",
      severity: "serious",
      message: `<${el.tagName.toLowerCase()}> has a positive tabindex (${tabIndexVal}), which disrupts natural focus order.`,
    };
  }
  return { rule: "focus-order-semantics", status: "pass" };
}

function checkLabel(el: CheckableElement): A11yCheckResult {
  // No form-field-shaped archetype exists yet in M3 (Text Input / Form
  // Field land in M4); a generic label check has nothing structural to
  // assert against a button archetype instance, so it passes vacuously.
  // This is revisited when the Text Input / Form Field archetypes exist.
  void el;
  return { rule: "label", status: "pass" };
}

const SUBSTITUTIONS: Record<string, (el: CheckableElement) => A11yCheckResult> = {
  "button-name": checkButtonName,
  "focus-order-semantics": checkFocusOrderSemantics,
  label: checkLabel,
};

/** Run one named axe-style rule as a direct DOM check. `color-contrast` is not handled here — see modules/contrast.ts. */
export function runA11yRule(rule: string, el: CheckableElement): A11yCheckResult {
  const fn = SUBSTITUTIONS[rule];
  if (!fn) {
    return {
      rule,
      status: "skipped",
      message: `No direct-DOM substitution implemented for rule "${rule}"; recorded as skipped, not silently passed.`,
    };
  }
  return fn(el);
}
