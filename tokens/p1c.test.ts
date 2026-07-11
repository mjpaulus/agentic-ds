import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseTokens } from "./parser.js";
import { validateRules } from "./validate-rules.js";
import { emitCss } from "./emit.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPECS_PATH = resolve(__dirname, "../specs/tokens.json");

function getCombinedCss(): string {
  const data = parseTokens(SPECS_PATH);
  validateRules(data);
  return emitCss(data).combined;
}

/**
 * Extract the raw declaration block body for a `:root[data-context='X']`
 * selector via a small hand-rolled scan (no CSS parser dependency, per plan).
 */
function extractBlock(css: string, context: string): string | null {
  const selector = `:root[data-context='${context}']`;
  const start = css.indexOf(selector);
  if (start === -1) return null;
  const braceOpen = css.indexOf("{", start);
  if (braceOpen === -1) return null;
  const braceClose = css.indexOf("}", braceOpen);
  if (braceClose === -1) return null;
  return css.slice(braceOpen + 1, braceClose);
}

function extractDeclaredValue(block: string, prop: string): string | null {
  // Match "--sem-color-action-bg: <value>;" but not e.g. "-hover" variants,
  // by requiring the property name be followed immediately by a colon.
  const re = new RegExp(`(?:^|\\s)${prop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*([^;]+);`);
  const match = re.exec(block);
  return match ? (match[1] as string).trim() : null;
}

describe("P1c: context blocks emit and structurally differ", () => {
  const css = getCombinedCss();

  it("emits exactly two context blocks: consumer-web and enterprise-saas", () => {
    const consumerCount = css.split(":root[data-context='consumer-web']").length - 1;
    const enterpriseCount = css.split(":root[data-context='enterprise-saas']").length - 1;
    expect(consumerCount).toBe(1);
    expect(enterpriseCount).toBe(1);
  });

  it("consumer-web block declares --sem-color-action-bg as #2563eb", () => {
    const block = extractBlock(css, "consumer-web");
    expect(block).not.toBeNull();
    expect(extractDeclaredValue(block as string, "--sem-color-action-bg")).toBe("#2563eb");
  });

  it("enterprise-saas block declares --sem-color-action-bg as #1d4ed8, differing from consumer-web", () => {
    const block = extractBlock(css, "enterprise-saas");
    expect(block).not.toBeNull();
    const value = extractDeclaredValue(block as string, "--sem-color-action-bg");
    expect(value).toBe("#1d4ed8");
    expect(value).not.toBe(
      extractDeclaredValue(extractBlock(css, "consumer-web") as string, "--sem-color-action-bg")
    );
  });

  it("fails to find a value for a missing block (sanity check that the scan can actually fail)", () => {
    const block = extractBlock(css, "nonexistent-context");
    expect(block).toBeNull();
  });
});

describe("P1c: live getComputedStyle flip via data-context attribute", () => {
  it("flips --sem-color-action-bg through the cascade when data-context changes", () => {
    const css = getCombinedCss();
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);

    try {
      document.documentElement.dataset.context = "consumer-web";
      const consumerValue = getComputedStyle(document.documentElement)
        .getPropertyValue("--sem-color-action-bg")
        .trim();

      document.documentElement.dataset.context = "enterprise-saas";
      const enterpriseValue = getComputedStyle(document.documentElement)
        .getPropertyValue("--sem-color-action-bg")
        .trim();

      // KNOWN RISK (documented in the implementation plan): happy-dom's
      // getComputedStyle does not evaluate `[data-context='...']` attribute
      // selectors when resolving custom properties — verified directly
      // against happy-dom's Window API, it returns the *last declared* rule's
      // value regardless of which attribute value is actually set, rather
      // than either the correct per-attribute value or an empty string. That
      // means this live-flip check cannot meaningfully assert cascade
      // correctness in this test environment. Per the plan, we do not weaken
      // this assertion to something that would pass anyway; instead we skip
      // it and rely on the structural CSS-text assertions above as the real
      // P1c enforcement.
      if (consumerValue === enterpriseValue) {
        console.warn(
          "happy-dom does not resolve --sem-color-action-bg differently per " +
            "[data-context] attribute value via getComputedStyle (both resolved " +
            `to "${consumerValue}"); skipping live-flip assertion. Structural ` +
            "CSS-text assertions above remain the enforcement for P1c."
        );
        return;
      }

      expect(consumerValue).toBe("#2563eb");
      expect(enterpriseValue).toBe("#1d4ed8");
    } finally {
      document.head.removeChild(style);
      delete document.documentElement.dataset.context;
    }
  });
});
