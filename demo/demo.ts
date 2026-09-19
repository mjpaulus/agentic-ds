// M5 demo module: Steps 2-4 of the five-step script (success-criteria.md).
// Fetches demo/demo-data.json (written by `npm run build:demo-data`, real
// pipeline records) for Steps 2 and 3, and runs the gate simulation LIVE in
// the browser for Step 4 using telemetry/gate.ts + telemetry/evolution.ts
// (both browser-safe, zero node imports) against telemetry/synthetic.ts's
// deterministic event generator. Promotion in Step 4 uses a PRECOMPUTED real
// revalidation record (from the build step) as its `revalidate` result — the
// browser cannot re-run Stage 2-4 itself (ajv schema file reads, happy-dom
// windows, etc. are node-side). This module is honest about that split: the
// UI labels precomputed vs. live pieces explicitly.

import { deprecateChallenger, promoteChallenger } from "../telemetry/evolution.js";
import { evaluateGate, type GateDecision } from "../telemetry/gate.js";
import { generateEvents, type SyntheticGeneratorConfig } from "../telemetry/synthetic.js";
import { Registry, type RegistryEntry } from "../registry/registry.js";
import type { ComponentDefinition, ValidationRecord } from "../validator/types.js";
import type { StructuredRequirement } from "../generation/requirement.js";
import type { AdaptationDecision } from "../adaptation/decider.js";
import type { ContextId } from "../adaptation/contract.js";

interface P3DemoRecord {
  requirementId: string;
  requirement: StructuredRequirement;
  definition: ComponentDefinition;
  css: string;
  record: ValidationRecord;
}

interface DemoData {
  generatedAt: string;
  p3: P3DemoRecord[];
  poison: { definition: ComponentDefinition; css: string; record: ValidationRecord };
  buttonRevalidation: { definition: ComponentDefinition; record: ValidationRecord };
}

async function loadDemoData(): Promise<DemoData> {
  const res = await fetch("./demo-data.json");
  if (!res.ok) throw new Error(`Failed to fetch demo-data.json (${res.status}). Run "npm run build:demo-data" first.`);
  return (await res.json()) as DemoData;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, children: (Node | string)[] = []): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const child of children) node.append(child);
  return node;
}

function renderRecord(record: ValidationRecord): HTMLElement {
  const wrap = el("div", { className: "record" });
  wrap.append(el("p", { textContent: `outcome: ${record.outcome} (passed: ${record.passed})` }));
  if (record.rejection) {
    const r = record.rejection;
    wrap.append(
      el("div", { className: "rejection" }, [
        el("p", { textContent: `Stage ${r.stage} · ${r.module}${r.constraintId ? ` · constraint "${r.constraintId}"` : ""}` }),
        el("p", { textContent: `source span: ${r.sourceSpan}` }),
        el("p", { textContent: r.message }),
      ])
    );
  }
  if (record.warnings.length > 0) {
    wrap.append(el("p", { textContent: `${record.warnings.length} warning(s)` }));
  }
  return wrap;
}

// ---------------------------------------------------------------------------
// Step 2: generate a component
// ---------------------------------------------------------------------------

function initStep2(data: DemoData, registryMirror: Map<string, P3DemoRecord>): void {
  const select = document.getElementById("gen-requirement") as HTMLSelectElement;
  const preview = document.getElementById("gen-json-preview") as HTMLTextAreaElement;
  const submit = document.getElementById("gen-submit") as HTMLButtonElement;
  const output = document.getElementById("gen-output") as HTMLElement;
  const registryList = document.getElementById("gen-registry-mirror") as HTMLElement;

  for (const p3 of data.p3) {
    select.append(el("option", { value: p3.requirementId, textContent: `${p3.requirementId} — ${p3.requirement.name}` }));
  }

  function showSelected(): void {
    const chosen = data.p3.find((p) => p.requirementId === select.value);
    if (!chosen) return;
    preview.value = JSON.stringify(chosen.requirement, null, 2);
  }
  select.addEventListener("change", showSelected);
  showSelected();

  submit.addEventListener("click", () => {
    const chosen = data.p3.find((p) => p.requirementId === select.value);
    if (!chosen) return;
    output.innerHTML = "";
    output.append(el("h4", { textContent: `${chosen.definition.name} — ${chosen.record.passed ? "REGISTERED" : "REJECTED"}` }));
    output.append(renderRecord(chosen.record));

    if (chosen.record.passed) {
      registryMirror.set(chosen.definition.name, chosen);
      output.append(el("p", { className: "justification", textContent: `Justification: ${chosen.definition.provenance.justification ?? "(none)"}` }));
      const previewBox = el("div", { className: `ds-preview ds-preview-${chosen.definition.name}` }, [chosen.definition.name]);
      const style = el("style", { textContent: chosen.css.replace(/:host/g, `.ds-preview-${chosen.definition.name}`) });
      output.append(style, el("p", { textContent: "Live token-styled preview (honest placeholder — this novel component has no hand-authored archetype yet, see generation/synthesize.ts):" }), previewBox);
    } else {
      output.append(el("p", { className: "justification", textContent: `Justification (attempted, but pipeline rejected it): ${chosen.definition.provenance.justification ?? "(none)"}` }));
    }

    registryList.innerHTML = "";
    for (const [name, entry] of registryMirror) {
      registryList.append(el("li", { textContent: `${name} — ${entry.record.outcome}` }));
    }
  });
}

// ---------------------------------------------------------------------------
// Step 3: poison the pipeline
// ---------------------------------------------------------------------------

function initStep3(data: DemoData): void {
  const button = document.getElementById("poison-submit") as HTMLButtonElement;
  const output = document.getElementById("poison-output") as HTMLElement;

  button.addEventListener("click", () => {
    output.innerHTML = "";
    output.append(el("h4", { textContent: `${data.poison.definition.name} — submitted with css referencing a --prim- token` }));
    output.append(el("pre", { textContent: data.poison.css }));
    output.append(renderRecord(data.poison.record));
  });
}

// ---------------------------------------------------------------------------
// Step 4: run the gate, live
// ---------------------------------------------------------------------------

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const WINDOW_START = Date.parse("2026-07-01T00:00:00Z");

function buttonRegistryEntry(definition: ComponentDefinition, record: ValidationRecord): RegistryEntry {
  return {
    name: definition.name,
    version: definition.version,
    definition,
    apiSignatureHash: "precomputed-from-build-step",
    validationRecord: record,
    flagged: false,
    registeredAt: record.timestamp,
  };
}

function seedConfig(seed: number, outcome: "win" | "lose"): SyntheticGeneratorConfig {
  const challengerTti = outcome === "win" ? 258 : 305;
  return {
    componentName: "ds-button",
    context: "enterprise-saas",
    seed,
    windowStart: WINDOW_START,
    windowMs: 14 * MS_PER_DAY,
    variants: [
      { variantName: "standard", completionRate: 0.9, errorRate: 0.05, abandonmentRate: 0.1, timeToInteractionMs: 300, sampleCount: 600 },
      { variantName: "compact-affordance", completionRate: outcome === "win" ? 0.92 : 0.85, errorRate: outcome === "win" ? 0.04 : 0.06, abandonmentRate: outcome === "win" ? 0.08 : 0.12, timeToInteractionMs: challengerTti, sampleCount: 600 },
    ],
  };
}

function renderGateResult(container: HTMLElement, decision: GateDecision, challengerMetric: number, incumbentMetric: number, samples: number): void {
  container.innerHTML = "";
  container.append(
    el("p", { textContent: `decision: ${decision.toUpperCase()}` }),
    el("p", { textContent: `incumbent (standard) time-to-interaction: ${incumbentMetric.toFixed(1)}ms` }),
    el("p", { textContent: `challenger (compact-affordance) time-to-interaction: ${challengerMetric.toFixed(1)}ms` }),
    el("p", { textContent: `challenger samples: ${samples}` })
  );
}

function renderStatusBoard(container: HTMLElement, registry: Registry): void {
  container.innerHTML = "";
  const entry = registry.get("ds-button");
  if (!entry) return;
  for (const v of entry.definition.variants ?? []) {
    container.append(el("li", { textContent: `${v.name} (${(v.contextPreference ?? ["*"]).join(", ")}): ${v.status}` }));
  }
}

function initStep4(data: DemoData): void {
  const winButton = document.getElementById("gate-run-win") as HTMLButtonElement;
  const loseButton = document.getElementById("gate-run-lose") as HTMLButtonElement;
  const resultBox = document.getElementById("gate-result") as HTMLElement;
  const statusBoard = document.getElementById("gate-status-board") as HTMLElement;
  const revalidationBox = document.getElementById("gate-revalidation") as HTMLElement;

  function freshRegistry(): Registry {
    const registry = new Registry();
    registry.register(buttonRegistryEntry(data.buttonRevalidation.definition, data.buttonRevalidation.record));
    return registry;
  }

  let registry = freshRegistry();
  renderStatusBoard(statusBoard, registry);

  async function run(outcome: "win" | "lose"): Promise<void> {
    registry = freshRegistry();
    const events = generateEvents(seedConfig(42, outcome));
    const incumbentEvents = events.filter((e) => e.variantName === "standard");
    const challengerEvents = events.filter((e) => e.variantName === "compact-affordance");
    const gateConfig = data.buttonRevalidation.definition.evolution!.gate;

    const now = outcome === "win" ? WINDOW_START + 5 * MS_PER_DAY : WINDOW_START + (gateConfig.windowDays ?? 14) * MS_PER_DAY + MS_PER_DAY;

    const gateResult = evaluateGate({ incumbentEvents, challengerEvents, gate: gateConfig, windowStart: WINDOW_START, now });
    renderGateResult(resultBox, gateResult.decision, gateResult.challengerMetric, gateResult.incumbentMetric, gateResult.samples);

    revalidationBox.innerHTML = "";
    if (gateResult.decision === "promote") {
      // Precomputed real revalidation record from the build step — the
      // browser doesn't re-run Stages 2-4 itself. Labeled explicitly.
      const result = await promoteChallenger({
        registry,
        componentName: "ds-button",
        challengerVariant: "compact-affordance",
        revalidate: async () => data.buttonRevalidation.record,
      });
      revalidationBox.append(
        el("p", { textContent: "Promotion re-ran Stages 2-4 before flipping the registry (precomputed real record from the build step, replayed here):" }),
        renderRecord(result.record)
      );
    } else if (gateResult.decision === "auto-deprecate") {
      deprecateChallenger({ registry, componentName: "ds-button", challengerVariant: "compact-affordance", reason: "gate window closed without meeting threshold" });
      revalidationBox.append(el("p", { textContent: "Window closed without a win: challenger auto-deprecated. No revalidation needed for a deprecation." }));
    }

    renderStatusBoard(statusBoard, registry);
  }

  winButton.addEventListener("click", () => void run("win"));
  loseButton.addEventListener("click", () => void run("lose"));
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const data = await loadDemoData();
  const registryMirror = new Map<string, P3DemoRecord>();
  initStep2(data, registryMirror);
  initStep3(data);
  initStep4(data);
}

main().catch((err) => {
  console.error(err);
  const banner = document.createElement("p");
  banner.textContent = `Demo data failed to load: ${err instanceof Error ? err.message : String(err)}`;
  banner.style.color = "red";
  document.body.prepend(banner);
});

// ---------------------------------------------------------------------------
// M6: Adaptive runtime. Talks to the vite.config.ts /api/adapt middleware
// only — Jev's API key never reaches the browser. Independent of the
// M1-M5 bootstrap above: a /api/adapt outage must not break the rest of
// the demo page, so this runs in its own try/catch.
// ---------------------------------------------------------------------------

interface AdaptResponse {
  decision: AdaptationDecision;
  mode: "live" | "recorded" | "unavailable";
}

interface AdaptStatus {
  mode: "live" | "recorded";
  model: string;
  contractVersion: string;
  fixtureProvenance: string;
}

/** Like el(), but takes a `style` CSS-text string instead of a CSSStyleDeclaration (el()'s prop type doesn't accept plain strings for `style`). */
function elS<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  opts: { textContent?: string; style?: string } = {}
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (opts.textContent !== undefined) node.textContent = opts.textContent;
  if (opts.style !== undefined) node.style.cssText = opts.style;
  return node;
}

function currentContext(): ContextId {
  return document.documentElement.getAttribute("data-context") as ContextId;
}

function renderDecisionRecord(container: HTMLElement, decision: AdaptationDecision): void {
  container.innerHTML = "";
  for (const lever of decision.record.levers) {
    const row = elS("div", { style: "margin: 0.35rem 0;" });
    row.append(el("div", { textContent: lever.moved }));
    if (typeof lever.answer === "number") {
      const bar = elS("div", { style: "background: var(--sem-color-input-border); height: 6px; border-radius: 3px; overflow: hidden; width: 200px;" });
      const fill = elS("div", {
        style: `background: var(--sem-color-action-bg); height: 100%; width: ${Math.round(lever.answer * 100)}%;`,
      });
      bar.append(fill);
      row.append(bar);
    } else if (lever.answer && typeof lever.answer === "object" && "probabilities" in (lever.answer as object)) {
      const probs = (lever.answer as { probabilities: Record<string, number> }).probabilities;
      for (const [option, p] of Object.entries(probs)) {
        const bar = elS("div", { style: "display: flex; align-items: center; gap: 0.5rem; font: var(--sem-type-caption);" });
        bar.append(elS("span", { textContent: option, style: "width: 8rem;" }));
        const track = elS("div", { style: "background: var(--sem-color-input-border); height: 6px; border-radius: 3px; overflow: hidden; width: 150px;" });
        track.append(elS("div", { style: `background: var(--sem-color-action-bg); height: 100%; width: ${Math.round(p * 100)}%;` }));
        bar.append(track);
        row.append(bar);
      }
    }
    container.append(row);
  }
}

function renderActuation(container: HTMLElement, decision: AdaptationDecision): void {
  container.innerHTML = "";
  const toggleLabel = document.getElementById("context-label");
  const root = document.documentElement;

  if (decision.contextAction === "apply") {
    root.setAttribute("data-context", decision.contextChoice);
    if (toggleLabel) toggleLabel.textContent = decision.contextChoice;
    container.append(el("p", { textContent: `Context flipped to "${decision.contextChoice}" (confidence ${decision.contextConfidence.toFixed(2)}).` }));
  } else if (decision.contextAction === "suggest") {
    const p = el("p", { textContent: `Jev suggests "${decision.contextChoice}" (confidence ${decision.contextConfidence.toFixed(2)}) but confidence is below auto-apply. ` });
    const suggestBtn = document.createElement("ds-button");
    suggestBtn.setAttribute("variant", "secondary");
    suggestBtn.setAttribute("size", "small");
    suggestBtn.textContent = `Switch to ${decision.contextChoice}?`;
    suggestBtn.addEventListener("ds-press", () => {
      root.setAttribute("data-context", decision.contextChoice);
      if (toggleLabel) toggleLabel.textContent = decision.contextChoice;
      p.append(" Applied.");
    });
    p.append(suggestBtn);
    container.append(p);
  } else if (decision.contextChoice === root.getAttribute("data-context")) {
    container.append(el("p", { textContent: `Already in "${decision.contextChoice}" (confidence ${decision.contextConfidence.toFixed(2)}) — nothing to change.` }));
  } else {
    container.append(el("p", { textContent: `Confidence ${decision.contextConfidence.toFixed(2)} is too low to change layout — keeping current context.` }));
  }
}

function renderWorkspace(container: HTMLElement, decision: AdaptationDecision): void {
  container.innerHTML = "";
  if (decision.components.length === 0) {
    container.append(el("p", { textContent: "No registered component crossed the relevance threshold for this task." }));
    return;
  }

  const has = (name: string) => decision.components.includes(name);

  if (has("ds-form-field") || has("ds-text-input") || has("ds-label")) {
    const wrap = elS("div", { style: "margin-bottom: 0.75rem;" });
    wrap.innerHTML = `
      <ds-label for="m6-field-input" required>Entry</ds-label>
      <ds-text-input id="m6-field-input" name="m6-entry" placeholder="Type here..."></ds-text-input>
    `;
    container.append(wrap);
  }

  if (has("ds-search-bar")) {
    const wrap = elS("div", { style: "margin-bottom: 0.75rem;" });
    wrap.innerHTML = `<ds-search-bar placeholder="Search components..."></ds-search-bar>`;
    container.append(wrap);
  }

  if (has("ds-checkbox") && decision.destructive) {
    const wrap = elS("div", { style: "margin-bottom: 0.75rem; display: flex; align-items: center; gap: 0.5rem;" });
    wrap.innerHTML = `<ds-checkbox id="m6-confirm"></ds-checkbox><ds-label for="m6-confirm">I understand this cannot be undone</ds-label>`;
    container.append(wrap);
  } else if (has("ds-checkbox")) {
    const wrap = elS("div", { style: "margin-bottom: 0.75rem; display: flex; align-items: center; gap: 0.5rem;" });
    wrap.innerHTML = `<ds-checkbox id="m6-check"></ds-checkbox><ds-label for="m6-check">Option</ds-label>`;
    container.append(wrap);
  }

  if (has("ds-badge")) {
    const wrap = elS("div", { style: "margin-bottom: 0.75rem;" });
    wrap.innerHTML = `<ds-badge variant="info">Status</ds-badge>`;
    container.append(wrap);
  }

  if (has("ds-button")) {
    const wrap = el("div", {});
    const variant = decision.destructive ? "danger" : "primary";
    wrap.innerHTML = `<ds-button variant="${variant}" size="small">${decision.destructive ? "Delete" : "Continue"}</ds-button>`;
    container.append(wrap);
  }

  if (decision.needsGuidance) {
    container.append(elS("p", { textContent: "Guidance mode: this task looks unfamiliar, so extra hints would show here (progressive disclosure).", style: "font: var(--sem-type-caption); color: var(--sem-color-text-secondary);" }));
  }
}

async function askJev(task: string): Promise<void> {
  const output = document.getElementById("m6-output") as HTMLElement;
  const recordEl = document.getElementById("m6-record") as HTMLElement;
  const actuationEl = document.getElementById("m6-actuation") as HTMLElement;
  const workspaceEl = document.getElementById("m6-workspace") as HTMLElement;
  const gapBanner = document.getElementById("m6-gap-banner") as HTMLElement;

  output.style.display = "block";
  recordEl.textContent = "Asking Jev...";
  actuationEl.innerHTML = "";
  workspaceEl.innerHTML = "";
  gapBanner.style.display = "none";

  const res = await fetch("/api/adapt", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ task, currentContext: currentContext() }),
  });
  const body = (await res.json()) as AdaptResponse;
  const decision = body.decision;

  renderDecisionRecord(recordEl, decision);
  renderActuation(actuationEl, decision);
  renderWorkspace(workspaceEl, decision);

  if (decision.gapDetected) {
    gapBanner.style.display = "block";
    gapBanner.innerHTML = `No registered component fits this task → send to generation flow. <a href="#m5-step2">Jump to Step 2 (generate a component)</a>.`;
  }
}

async function initM6(): Promise<void> {
  const badge = document.getElementById("m6-mode-badge") as HTMLElement;
  try {
    const statusRes = await fetch("/api/adapt/status");
    const status = (await statusRes.json()) as AdaptStatus;
    if (status.mode === "live") {
      badge.textContent = `LIVE · ${status.model}`;
    } else {
      badge.textContent = `RECORDED · ${status.fixtureProvenance} (export TYPESAFE_API_KEY and run npm run adaptation:record to replace with real Jev output)`;
    }
  } catch (err) {
    badge.textContent = "UNAVAILABLE · /api/adapt/status did not respond";
  }

  const taskInput = document.getElementById("m6-task") as HTMLInputElement;
  const submit = document.getElementById("m6-submit") as HTMLButtonElement;
  submit.addEventListener("click", () => {
    if (taskInput.value.trim()) void askJev(taskInput.value.trim());
  });
  taskInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && taskInput.value.trim()) void askJev(taskInput.value.trim());
  });
  for (const btn of Array.from(document.querySelectorAll<HTMLButtonElement>(".m6-preset"))) {
    btn.addEventListener("click", () => {
      const task = btn.dataset.task ?? "";
      taskInput.value = task;
      void askJev(task);
    });
  }
}

void initM6();
