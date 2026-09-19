import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { RecordedAdaptationDecider, type FixtureFile } from "./backends/recorded.js";
import { resolveAdaptation } from "./decider.js";
import { THRESHOLDS } from "./contract.js";
import type { ContextId } from "./contract.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const file = JSON.parse(readFileSync(resolve(__dirname, "fixtures/recorded-answers.json"), "utf-8")) as FixtureFile;

const catalog = [
  "ds-button",
  "ds-label",
  "ds-badge",
  "ds-text-input",
  "ds-checkbox",
  "ds-form-field",
  "ds-search-bar",
].map((name) => ({ name, purpose: name }));

const composeAll = { isComposable: () => true };
const meta = { model: "jev-1.13.0", contractVersion: "1.0.0", mode: "recorded" as const };

interface Expectation {
  task: string;
  currentContext: ContextId;
  contextAction: "apply" | "suggest" | "keep";
  destructive?: boolean;
  gapDetected?: boolean;
  componentsInclude?: string[];
}

const TABLE: Expectation[] = [
  {
    task: "Reconcile 40 vendor invoices against POs before Friday's audit",
    currentContext: "consumer-web",
    contextAction: "apply",
    destructive: false,
    componentsInclude: ["ds-form-field", "ds-text-input", "ds-checkbox", "ds-button"],
  },
  {
    task: "Sign me up for the newsletter",
    currentContext: "enterprise-saas",
    contextAction: "apply",
    destructive: false,
    componentsInclude: ["ds-text-input", "ds-button", "ds-label"],
  },
  {
    task: "Delete my account and all my data",
    currentContext: "enterprise-saas",
    contextAction: "suggest",
    destructive: true,
    componentsInclude: ["ds-button"],
  },
  {
    task: "Search the component catalog for badge variants",
    currentContext: "consumer-web",
    contextAction: "suggest",
    destructive: false,
    componentsInclude: ["ds-search-bar"],
  },
  {
    task: "Set up a Kanban board for my team",
    currentContext: "consumer-web",
    contextAction: "suggest",
    gapDetected: true,
  },
  {
    task: "Review last month's analytics dashboard",
    currentContext: "consumer-web",
    contextAction: "keep",
  },
];

describe("recorded fixtures resolve to their documented decisions", () => {
  for (const expectation of TABLE) {
    it(expectation.task, async () => {
      const decider = new RecordedAdaptationDecider(file);
      const raw = await decider.decide({ task: expectation.task, currentContext: expectation.currentContext, catalog });
      const decision = resolveAdaptation(raw, expectation.currentContext, THRESHOLDS, composeAll, meta);

      expect(decision.contextAction).toBe(expectation.contextAction);
      if (expectation.destructive !== undefined) expect(decision.destructive).toBe(expectation.destructive);
      if (expectation.gapDetected !== undefined) expect(decision.gapDetected).toBe(expectation.gapDetected);
      if (expectation.componentsInclude) {
        for (const name of expectation.componentsInclude) expect(decision.components).toContain(name);
      }
    });
  }
});

describe("fixture file integrity", () => {
  it("has provenance 'synthetic-hand-authored'", () => {
    expect(file.provenance).toBe("synthetic-hand-authored");
  });

  it("every fixture's context probabilities sum to ~1", () => {
    for (const [task, entry] of Object.entries(file.fixtures)) {
      const sum = Object.values(entry.context.probabilities).reduce((a, b) => a + b, 0);
      expect(sum, `context probabilities for "${task}"`).toBeCloseTo(1, 1);
    }
  });

  it("every fixture entry is marked synthetic-hand-authored", () => {
    for (const [task, entry] of Object.entries(file.fixtures)) {
      expect(entry.provenance, task).toBe("synthetic-hand-authored");
    }
  });
});
