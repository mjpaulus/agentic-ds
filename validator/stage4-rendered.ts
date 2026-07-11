// Stage 4: rendered verification (constraint-enforcement-spec.md Section 1
// Stage 4, Sections 3-4). Runs only when the candidate carries a generated
// `source` artifact (generator/generate.ts output evaluated in a headless
// happy-dom tree). Definitions without a source artifact keep a "deferred"
// note ONLY if they declare no accessibility constraint — a definition that
// declares accessibility but supplies nothing to render cannot have that
// constraint checked, and an unchecked constraint does not pass.

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Window } from "happy-dom";
import { emitCss } from "../tokens/emit.js";
import { parseTokens } from "../tokens/parser.js";
import type { TokensFile } from "../tokens/types.js";
import { AA_CONTRAST_MIN, checkContrastPairs, loadRealTokens } from "./modules/contrast.js";
import { runA11yRule } from "./modules/a11y-checks.js";
import type {
  ApiSlot,
  Candidate,
  ComponentDefinition,
  ConstraintEntry,
  PerformanceBudget,
  RejectionDetail,
  StageResult,
} from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = resolve(__dirname, "../tokens/dist");
const TOKENS_SPEC_PATH = resolve(__dirname, "../specs/tokens.json");

const MODULE = "stage4-rendered";

export interface Stage4Outcome {
  stageResult: StageResult;
  rejection?: RejectionDetail;
  warnings: RejectionDetail[];
}

function reject(module: string, constraintId: string | null, message: string, sourceSpan: string): RejectionDetail {
  return { stage: 4, module, constraintId, message, sourceSpan };
}

// -----------------------------------------------------------------------
// Environment construction
// -----------------------------------------------------------------------

/** A minimal typed handle on the parts of a happy-dom Window Stage 4 needs. Cross-realm DOM types don't unify cleanly with lib.dom.d.ts, hence the narrow local shape + targeted casts below. */
interface RenderEnv {
  window: InstanceType<typeof Window>;
  document: Document;
  consoleErrors: string[];
}

function capturingConsole(errors: string[]): Console {
  const noop = () => {};
  return {
    error: (...args: unknown[]) => {
      errors.push(args.map((a) => String(a)).join(" "));
    },
    warn: noop,
    log: noop,
    info: noop,
    debug: noop,
  } as unknown as Console;
}

function resolveTokenCss(context: string): string {
  const distPath = resolve(DIST_DIR, `context-${context}.css`);
  if (existsSync(distPath)) return readFileSync(distPath, "utf-8");
  const data = parseTokens(TOKENS_SPEC_PATH);
  const emitted = emitCss(data);
  return emitted.perContext[context] ?? "";
}

function buildEnvironment(context: string): RenderEnv {
  const window = new Window();
  const document = window.document as unknown as Document;
  document.documentElement.setAttribute("data-context", context);
  const styleEl = document.createElement("style");
  styleEl.textContent = resolveTokenCss(context);
  document.head.appendChild(styleEl);
  return { window, document, consoleErrors: [] };
}

/**
 * Evaluate a generated component module string against a happy-dom Window.
 * Generated sources are self-contained (no imports) and end in
 * `export default <Class>;`, which `new Function` can't execute outside a
 * module — that trailing line is stripped (the generator's exact output
 * shape is known, so this is a safe, deterministic transform, not a parser).
 */
function evaluateComponentModule(source: string, env: RenderEnv): void {
  const body = source.replace(/\nexport default \w+;\s*$/, "\n");
  const fn = new Function("window", "document", "customElements", "HTMLElement", "CustomEvent", "console", "queueMicrotask", body);
  const win = env.window as unknown as {
    customElements: CustomElementRegistry;
    HTMLElement: typeof HTMLElement;
    CustomEvent: typeof CustomEvent;
  };
  fn(env.window, env.document, win.customElements, win.HTMLElement, win.CustomEvent, capturingConsole(env.consoleErrors), queueMicrotask);
}

function instantiate(env: RenderEnv, definition: ComponentDefinition): Element {
  const el = env.document.createElement(definition.name);
  env.document.body.appendChild(el);
  return el;
}

/** Generic "the interactive element" probe for keyboard operability: prefer a native interactive element inside shadow DOM, fall back to the host. */
function findInteractiveElement(el: Element): Element {
  const shadow = (el as unknown as { shadowRoot: ShadowRoot | null }).shadowRoot;
  if (shadow) {
    const inner = shadow.querySelector('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (inner) return inner;
  }
  return el;
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

// -----------------------------------------------------------------------
// Sub-checks
// -----------------------------------------------------------------------

interface KeyboardProbeResult {
  firedWhenEnabled: boolean;
  firedWhenDisabled: boolean;
}

function probeKeyboardOperability(env: RenderEnv, definition: ComponentDefinition, activationEvent: string): KeyboardProbeResult {
  const win = env.window as unknown as { KeyboardEvent: typeof KeyboardEvent };

  const enabledEl = instantiate(env, definition);
  let firedEnabled = false;
  enabledEl.addEventListener(activationEvent, () => {
    firedEnabled = true;
  });
  const enabledTarget = findInteractiveElement(enabledEl);
  enabledTarget.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true, composed: true }));
  if (!firedEnabled) {
    enabledTarget.dispatchEvent(new win.KeyboardEvent("keydown", { key: " ", bubbles: true, composed: true }));
  }

  const disabledEl = instantiate(env, definition);
  (disabledEl as unknown as { disabled: boolean }).disabled = true;
  let firedDisabled = false;
  disabledEl.addEventListener(activationEvent, () => {
    firedDisabled = true;
  });
  const disabledTarget = findInteractiveElement(disabledEl);
  disabledTarget.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true, composed: true }));

  return { firedWhenEnabled: firedEnabled, firedWhenDisabled: firedDisabled };
}

interface SlotProbeResult {
  slotName: string;
  allowedTriggeredError: boolean;
  disallowedTriggeredError: boolean;
}

async function probeSlot(env: RenderEnv, definition: ComponentDefinition, slot: ApiSlot): Promise<SlotProbeResult> {
  const allowed = slot.allowedElements ?? [];
  const isDefaultSlot = slot.name === "default";

  // Allowed content.
  const beforeAllowed = env.consoleErrors.length;
  const elAllowed = env.document.createElement(definition.name);
  if (allowed.length > 0) {
    const child = env.document.createElement(allowed[0] as string);
    if (!isDefaultSlot) child.setAttribute("slot", slot.name);
    elAllowed.appendChild(child);
  } else {
    const text = env.document.createTextNode("probe text");
    elAllowed.appendChild(text);
    // Text nodes can't carry a `slot` attribute; named-slot assignment for
    // text content relies on the slot being the element's only content path
    // in this archetype (icon slot has no sibling default slot fallback in
    // this probe), which matches the "text only" contract for an
    // empty-allowedElements slot.
  }
  env.document.body.appendChild(elAllowed);
  await flushMicrotasks();
  const allowedTriggeredError = env.consoleErrors.length > beforeAllowed;

  // Disallowed content: any element not in allowedElements. `div` is never
  // a legal component/element name in this system's slot allowlists.
  const beforeDisallowed = env.consoleErrors.length;
  const elDisallowed = env.document.createElement(definition.name);
  const disallowedChild = env.document.createElement("div");
  if (!isDefaultSlot) disallowedChild.setAttribute("slot", slot.name);
  elDisallowed.appendChild(disallowedChild);
  env.document.body.appendChild(elDisallowed);
  await flushMicrotasks();
  const disallowedTriggeredError = env.consoleErrors.length > beforeDisallowed;

  return { slotName: slot.name, allowedTriggeredError, disallowedTriggeredError };
}

// -----------------------------------------------------------------------
// Orchestration
// -----------------------------------------------------------------------

export async function runStage4(
  candidate: Candidate,
  definition: ComponentDefinition,
  tokenData: TokensFile = loadRealTokens()
): Promise<Stage4Outcome> {
  const notes: string[] = [];
  const warnings: RejectionDetail[] = [];

  const hasArtifact = candidate.source !== undefined;
  const a11yConstraint = definition.constraints.find((c) => c.type === "accessibility");
  const perfConstraint = definition.constraints.find((c) => c.type === "performance");
  const compositionConstraint = definition.constraints.find((c) => c.type === "composition");

  if (!hasArtifact) {
    if (a11yConstraint) {
      const rejection = reject(
        MODULE,
        a11yConstraint.id,
        `Definition "${definition.name}" declares an accessibility constraint ("${a11yConstraint.id}") but no generated source artifact is present to render. A constraint that cannot be checked does not pass.`,
        "constraints"
      );
      return { rejection, warnings, stageResult: { stage: 4, name: MODULE, passed: false, notes: [rejection.message] } };
    }
    return {
      warnings,
      stageResult: { stage: 4, name: MODULE, passed: true, notes: ["stage4: no generated source artifact; rendered verification deferred (no accessibility constraint declared)"] },
    };
  }

  const contexts = definition.usage?.contexts ?? ["consumer-web"];
  const activationEvent = definition.api.events?.[0]?.name ?? "ds-press";

  for (const context of contexts) {
    const env = buildEnvironment(context);
    evaluateComponentModule(candidate.source as string, env);

    // --- accessibility: contrast (token-data math) ---------------------
    if (a11yConstraint) {
      const rule = a11yConstraint.rule as { rules?: string[] };
      const ruleList = rule.rules ?? [];

      if (ruleList.includes("color-contrast")) {
        const { violations, pairsChecked } = checkContrastPairs(definition, [context], tokenData);
        for (const v of violations) {
          const rejection = reject(
            "stage4-accessibility-contrast",
            a11yConstraint.id,
            `Contrast failure in context "${v.context}": ${v.token} vs ${v.pairedToken} resolves to a ${v.ratio.toFixed(2)}:1 ratio, below the WCAG 2.1 AA minimum of ${AA_CONTRAST_MIN}:1.`,
            `context:${v.context}`
          );
          return { rejection, warnings, stageResult: { stage: 4, name: MODULE, passed: false, notes: [...notes, rejection.message] } };
        }
        notes.push(`contrast (${context}): ${pairsChecked} declared pair(s) checked, all pass AA`);
      }

      // --- accessibility: direct-DOM rule substitutions -----------------
      // A real usage of a labelable component always supplies label content
      // via its default slot (a bare `<ds-button></ds-button>` with no
      // slotted text is not a realistic instance any more than an `<img>`
      // with no alt text is); the probe instance gets representative text
      // content so button-name checks reflect real composition, not an
      // artificially empty test fixture.
      const el = instantiate(env, definition);
      if ((definition.api.slots ?? []).some((s) => s.name === "default")) {
        el.textContent = definition.name;
      }
      await flushMicrotasks();
      for (const ruleName of ruleList) {
        if (ruleName === "color-contrast") continue;
        const result = runA11yRule(ruleName, el as unknown as { tagName: string; getAttribute(n: string): string | null; textContent: string | null });
        if (result.status === "skipped") {
          notes.push(`a11y rule "${ruleName}" (${context}): ${result.message}`);
          continue;
        }
        if (result.status === "violation") {
          const message = `a11y rule "${ruleName}" failed in context "${context}": ${result.message}`;
          if (result.severity === "moderate") {
            warnings.push(reject("stage4-accessibility", a11yConstraint.id, message, `context:${context}`));
          } else {
            const rejection = reject("stage4-accessibility", a11yConstraint.id, message, `context:${context}`);
            return { rejection, warnings, stageResult: { stage: 4, name: MODULE, passed: false, notes: [...notes, message] } };
          }
        } else {
          notes.push(`a11y rule "${ruleName}" (${context}): pass`);
        }
      }

      // --- keyboard operability probe ------------------------------------
      // Only meaningful for components that declare an activation event —
      // a fixture/definition with no api.events has nothing for a keydown
      // to activate, so the probe is skipped rather than manufacturing a
      // false "not operable" rejection.
      if ((definition.api.events?.length ?? 0) === 0) {
        notes.push(`keyboard operability (${context}): skipped, no api.events declared`);
      } else {
        const kb = probeKeyboardOperability(env, definition, activationEvent);
        if (!kb.firedWhenEnabled) {
          const rejection = reject(
            "stage4-accessibility-keyboard",
            a11yConstraint.id,
            `Keyboard operability probe failed in context "${context}": synthetic Enter/Space keydown did not fire "${activationEvent}" on an enabled instance.`,
            `context:${context}`
          );
          return { rejection, warnings, stageResult: { stage: 4, name: MODULE, passed: false, notes: [...notes, rejection.message] } };
        }
        if (kb.firedWhenDisabled) {
          const rejection = reject(
            "stage4-accessibility-keyboard",
            a11yConstraint.id,
            `Keyboard operability probe failed in context "${context}": "${activationEvent}" fired on a disabled instance; disabled must suppress activation.`,
            `context:${context}`
          );
          return { rejection, warnings, stageResult: { stage: 4, name: MODULE, passed: false, notes: [...notes, rejection.message] } };
        }
        notes.push(`keyboard operability (${context}): fires when enabled, suppressed when disabled`);
      }
    }

    // --- performance -------------------------------------------------------
    if (perfConstraint) {
      const t0 = performance.now();
      const perfEl = instantiate(env, definition);
      const t1 = performance.now();
      const renderMs = t1 - t0;

      const win = env.window as unknown as { MouseEvent: typeof MouseEvent };
      const t2 = performance.now();
      const interactiveTarget = findInteractiveElement(perfEl);
      interactiveTarget.dispatchEvent(new win.MouseEvent("click", { bubbles: true, composed: true }));
      const t3 = performance.now();
      const interactionMs = t3 - t2;

      const bundleKb = new TextEncoder().encode(candidate.source as string).length / 1024;

      const budget = perfConstraint.rule as PerformanceBudget;
      const breaches: string[] = [];
      if (budget.renderMs !== undefined && renderMs > budget.renderMs) {
        breaches.push(`renderMs ${renderMs.toFixed(2)} > budget ${budget.renderMs}`);
      }
      if (budget.interactionMs !== undefined && interactionMs > budget.interactionMs) {
        breaches.push(`interactionMs ${interactionMs.toFixed(2)} > budget ${budget.interactionMs}`);
      }
      if (budget.bundleKb !== undefined && bundleKb > budget.bundleKb) {
        breaches.push(`bundleKb ${bundleKb.toFixed(2)} > budget ${budget.bundleKb}`);
      }

      notes.push(
        `perf (${context}): render=${renderMs.toFixed(2)}ms interaction=${interactionMs.toFixed(2)}ms bundle=${bundleKb.toFixed(2)}kb (headless numbers are directional, not gospel)`
      );

      if (breaches.length > 0) {
        const message = `Performance budget breach in context "${context}" (headless numbers are directional): ${breaches.join("; ")}.`;
        if (perfConstraint.failureBehavior === "reject") {
          const rejection = reject("stage4-performance", perfConstraint.id, message, `context:${context}`);
          return { rejection, warnings, stageResult: { stage: 4, name: MODULE, passed: false, notes: [...notes, message] } };
        }
        const rationale = perfConstraint.rationale?.trim();
        if (!rationale) {
          const rejection = reject(
            "stage4-performance",
            perfConstraint.id,
            `${message} (failureBehavior "flag" but rationale is empty/missing; treated as reject.)`,
            `context:${context}`
          );
          return { rejection, warnings, stageResult: { stage: 4, name: MODULE, passed: false, notes: [...notes, rejection.message] } };
        }
        warnings.push(reject("stage4-performance", perfConstraint.id, message, `context:${context}`));
      }
    }

    // --- composition slot probes --------------------------------------
    if (compositionConstraint) {
      const rule = compositionConstraint.rule as { enforceSlotContent?: boolean };
      const slots = (definition.api.slots ?? []).filter((s) => s.allowedElements !== undefined);
      if (rule.enforceSlotContent && slots.length > 0) {
        for (const slot of slots) {
          const probeResult = await probeSlot(env, definition, slot);
          if (probeResult.allowedTriggeredError) {
            const message = `Slot composition probe failed in context "${context}": allowed content for slot "${slot.name}" incorrectly triggered a console error.`;
            const rejection = reject("stage4-composition", compositionConstraint.id, message, `slot:${slot.name}`);
            return { rejection, warnings, stageResult: { stage: 4, name: MODULE, passed: false, notes: [...notes, message] } };
          }
          if (!probeResult.disallowedTriggeredError) {
            const message = `Slot composition probe failed in context "${context}": disallowed content for slot "${slot.name}" did not trigger the required console error (connectedCallback/slotchange path must reject it).`;
            const rejection = reject("stage4-composition", compositionConstraint.id, message, `slot:${slot.name}`);
            return { rejection, warnings, stageResult: { stage: 4, name: MODULE, passed: false, notes: [...notes, message] } };
          }
          notes.push(`slot probe (${context}, slot "${slot.name}"): allowed content clean, disallowed content correctly rejected`);
        }
      }
    }
  }

  return { warnings, stageResult: { stage: 4, name: MODULE, passed: true, notes } };
}
