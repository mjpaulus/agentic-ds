// The AdaptationDecider seam (CLAUDE.md M6 / Section 7 "The Runtime Seam").
// Mirrors the injected-backend pattern in telemetry/evolution.ts
// (RevalidateFn) and generation/generate-definition.ts (the seam comment):
// callers depend on this interface, not on how an answer is produced. Two
// backends implement it — adaptation/backends/typesafe.ts (live) and
// adaptation/backends/recorded.ts (fixture) — and both are swappable without
// touching resolveAdaptation, which is the pure decision function and the
// thing under test in adaptation/decider.test.ts.

import type { ContextId, Thresholds } from "./contract.js";
import { COMPONENT_QUESTION_PREFIX, THRESHOLDS } from "./contract.js";
import type { CatalogEntry } from "./contract.js";

/** Flattened answers, independent of the SDK's response shape — both backends produce this. */
export interface RawAnswers {
  context: { choice: ContextId; probabilities: Record<string, number>; confidence: number };
  /** component name -> Noul probability, one entry per catalog component asked about. */
  components: Record<string, number>;
  is_destructive: number;
  needs_guidance: number;
  gap: number;
}

export interface AdaptationDeciderInput {
  task: string;
  currentContext: ContextId;
  catalog: CatalogEntry[];
}

/** Implemented per-backend; see backends/typesafe.ts and backends/recorded.ts. */
export interface AdaptationDecider {
  decide(input: AdaptationDeciderInput): Promise<RawAnswers>;
}

export type ContextAction = "apply" | "suggest" | "keep";

export interface LeverRecord {
  lever: string;
  answer: unknown;
  moved: string;
}

export interface AdaptationRecord {
  model: string;
  contractVersion: string;
  mode: "live" | "recorded" | "unavailable";
  thresholds: Thresholds;
  raw: RawAnswers;
  levers: LeverRecord[];
}

export interface AdaptationDecision {
  contextAction: ContextAction;
  contextChoice: ContextId;
  contextConfidence: number;
  /** Registered, composable component names whose Noul >= componentRelevant, ordered by probability desc. */
  components: string[];
  destructive: boolean;
  needsGuidance: boolean;
  gapDetected: boolean;
  record: AdaptationRecord;
}

/** Registry surface resolveAdaptation needs — kept minimal so tests can pass a stub instead of a real Registry. */
export interface ComposabilityCheck {
  isComposable(name: string): boolean;
}

/**
 * PURE decision function (constraint-enforcement-spec.md Section 7: "the
 * runtime just swaps the binding source" — this is that swap point,
 * deliberately free of I/O). Confidence gating WITH hysteresis: only
 * 'apply' when confidence clears the high bar AND the choice actually
 * differs from the current context; low confidence resolves to STABILITY
 * (keep), never a guess.
 */
export function resolveAdaptation(
  raw: RawAnswers,
  current: ContextId,
  thresholds: Thresholds,
  registry: ComposabilityCheck,
  meta: { model: string; contractVersion: string; mode: AdaptationRecord["mode"] }
): AdaptationDecision {
  const { choice, confidence } = raw.context;
  let contextAction: ContextAction = "keep";
  if (choice !== current) {
    if (confidence >= thresholds.contextAutoApply) contextAction = "apply";
    else if (confidence >= thresholds.contextSuggest) contextAction = "suggest";
  }

  const components = Object.entries(raw.components)
    .filter(([name, prob]) => prob >= thresholds.componentRelevant && registry.isComposable(name))
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);

  const destructive = raw.is_destructive >= thresholds.destructive;
  const needsGuidance = raw.needs_guidance >= thresholds.needsGuidance;
  const gapDetected = raw.gap >= thresholds.gap;

  const levers: LeverRecord[] = [
    {
      lever: "context",
      answer: raw.context,
      moved:
        contextAction === "apply"
          ? `context -> ${choice} (applied, ${confidence.toFixed(2)})`
          : contextAction === "suggest"
            ? `context -> ${choice} (suggested, ${confidence.toFixed(2)})`
            : `context kept at ${current} (${confidence.toFixed(2)})`,
    },
    ...Object.entries(raw.components).map(([name, prob]) => ({
      lever: `${COMPONENT_QUESTION_PREFIX}${name}`,
      answer: prob,
      moved: `${name}: ${prob >= thresholds.componentRelevant ? "relevant" : "not relevant"} ${prob.toFixed(2)}`,
    })),
    { lever: "is_destructive", answer: raw.is_destructive, moved: `destructive: ${destructive} (${raw.is_destructive.toFixed(2)})` },
    { lever: "needs_guidance", answer: raw.needs_guidance, moved: `guidance: ${needsGuidance} (${raw.needs_guidance.toFixed(2)})` },
    { lever: "gap", answer: raw.gap, moved: `gap: ${raw.gap.toFixed(2)}` },
  ];

  return {
    contextAction,
    contextChoice: choice,
    contextConfidence: confidence,
    components,
    destructive,
    needsGuidance,
    gapDetected,
    record: {
      model: meta.model,
      contractVersion: meta.contractVersion,
      mode: meta.mode,
      thresholds,
      raw,
      levers,
    },
  };
}

/**
 * Fallback rule (CLAUDE.md M6): if the decider throws or is unreachable,
 * decision = keep current context, empty component plan, mode
 * 'unavailable'. Jev is middleware, not load-bearing — the UI must render
 * fine with it down. Callers (the /api/adapt handler, demo.ts) should wrap
 * decider.decide() in this rather than reimplementing the fallback shape.
 */
export async function decideWithFallback(
  decider: AdaptationDecider,
  input: AdaptationDeciderInput,
  registry: ComposabilityCheck,
  meta: { model: string; contractVersion: string }
): Promise<AdaptationDecision> {
  try {
    const raw = await decider.decide(input);
    return resolveAdaptation(raw, input.currentContext, THRESHOLDS, registry, {
      ...meta,
      mode: inferModeFromDecider(decider),
    });
  } catch {
    return {
      contextAction: "keep",
      contextChoice: input.currentContext,
      contextConfidence: 0,
      components: [],
      destructive: false,
      needsGuidance: false,
      gapDetected: false,
      record: {
        model: meta.model,
        contractVersion: meta.contractVersion,
        mode: "unavailable",
        thresholds: THRESHOLDS,
        raw: {
          context: { choice: input.currentContext, probabilities: {}, confidence: 0 },
          components: {},
          is_destructive: 0,
          needs_guidance: 0,
          gap: 0,
        },
        levers: [],
      },
    };
  }
}

/** Backends tag themselves so decideWithFallback's record can report which produced a successful answer. */
export interface ModedDecider extends AdaptationDecider {
  readonly mode: "live" | "recorded";
}

function inferModeFromDecider(decider: AdaptationDecider): "live" | "recorded" {
  return (decider as Partial<ModedDecider>).mode ?? "recorded";
}
