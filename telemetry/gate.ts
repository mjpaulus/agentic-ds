// Pure gate logic (constraint-enforcement-spec.md Section 5). Browser-safe:
// NO node imports — this file must be able to run in the demo page as-is.
//
// Metric mappings (Section 6):
//   task-completion-rate    <- task-completion (completed) vs component-abandonment
//   abandonment-rate        <- same two event types, inverse ratio
//   interaction-error-rate  <- component-interaction vs component-error
//   time-to-interaction     <- render timestamps, carried in the POC as the
//                              durationMs of a task-completion event with
//                              taskId "render-to-interaction" (see
//                              telemetry/synthetic.ts)
//
// Direction handling: for interaction-error-rate, abandonment-rate, and
// time-to-interaction, LOWER is better — "improvement" means the challenger's
// value is lower than the incumbent's by at least `threshold` (relative).
// For task-completion-rate, HIGHER is better. This is the one piece of
// domain knowledge gate.ts encodes about each metric's polarity.

import type { GateMetric, TelemetryEvent } from "./events.js";

export type { GateMetric };

const LOWER_IS_BETTER: ReadonlySet<GateMetric> = new Set([
  "interaction-error-rate",
  "abandonment-rate",
  "time-to-interaction",
]);

const RENDER_TO_INTERACTION_TASK_ID = "render-to-interaction";

/** Compute one gate metric from a flat event stream (already filtered to one variant/context/window). */
export function computeMetric(events: TelemetryEvent[], metric: GateMetric): number {
  switch (metric) {
    case "task-completion-rate": {
      const completions = events.filter(
        (e) => e.type === "task-completion" && e.taskId !== RENDER_TO_INTERACTION_TASK_ID && e.completed
      ).length;
      const abandonments = events.filter((e) => e.type === "component-abandonment").length;
      const total = completions + abandonments;
      return total === 0 ? 0 : completions / total;
    }
    case "abandonment-rate": {
      const completions = events.filter(
        (e) => e.type === "task-completion" && e.taskId !== RENDER_TO_INTERACTION_TASK_ID && e.completed
      ).length;
      const abandonments = events.filter((e) => e.type === "component-abandonment").length;
      const total = completions + abandonments;
      return total === 0 ? 0 : abandonments / total;
    }
    case "interaction-error-rate": {
      const interactions = events.filter((e) => e.type === "component-interaction").length;
      const errors = events.filter((e) => e.type === "component-error").length;
      return interactions === 0 ? 0 : errors / interactions;
    }
    case "time-to-interaction": {
      const ttiEvents = events.filter(
        (e): e is Extract<TelemetryEvent, { type: "task-completion" }> =>
          e.type === "task-completion" && e.taskId === RENDER_TO_INTERACTION_TASK_ID
      );
      if (ttiEvents.length === 0) return 0;
      const sum = ttiEvents.reduce((acc, e) => acc + e.durationMs, 0);
      return sum / ttiEvents.length;
    }
  }
}

function distinctSessionCount(events: TelemetryEvent[]): number {
  return new Set(events.map((e) => e.sessionId)).size;
}

function withinWindow(events: TelemetryEvent[], windowStart: number, windowEndExclusive: number): TelemetryEvent[] {
  return events.filter((e) => e.timestamp >= windowStart && e.timestamp < windowEndExclusive);
}

export interface GateConfig {
  metric: GateMetric;
  threshold: number;
  minSamples: number;
  windowDays?: number;
}

export interface EvaluateGateInput {
  incumbentEvents: TelemetryEvent[];
  challengerEvents: TelemetryEvent[];
  gate: GateConfig;
  windowStart: number;
  now: number;
}

export type GateDecision = "promote" | "auto-deprecate" | "pending";

export interface EvaluateGateResult {
  decision: GateDecision;
  challengerMetric: number;
  incumbentMetric: number;
  samples: number;
  /** Relative improvement of challenger over incumbent, direction-adjusted so positive always means "better". */
  relativeImprovement: number;
  windowClosed: boolean;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Evaluate the evolution gate for a single challenger vs. its incumbent.
 * NO draw state (CLAUDE.md non-negotiable #3): the only outcomes are
 * 'promote', 'auto-deprecate', or 'pending' (still within window, insufficient
 * samples or insufficient margin so far).
 */
export function evaluateGate(input: EvaluateGateInput): EvaluateGateResult {
  const { incumbentEvents, challengerEvents, gate, windowStart, now } = input;
  const windowDays = gate.windowDays ?? 14;
  const windowEnd = windowStart + windowDays * MS_PER_DAY;
  const windowClosed = now >= windowEnd;

  const challengerInWindow = withinWindow(challengerEvents, windowStart, windowEnd);
  const incumbentInWindow = withinWindow(incumbentEvents, windowStart, windowEnd);

  const samples = distinctSessionCount(challengerInWindow);

  const challengerMetric = computeMetric(challengerInWindow, gate.metric);
  const incumbentMetric = computeMetric(incumbentInWindow, gate.metric);

  const lowerIsBetter = LOWER_IS_BETTER.has(gate.metric);
  const relativeImprovement =
    incumbentMetric === 0
      ? 0
      : lowerIsBetter
        ? (incumbentMetric - challengerMetric) / incumbentMetric
        : (challengerMetric - incumbentMetric) / incumbentMetric;

  if (samples < gate.minSamples) {
    return {
      decision: windowClosed ? "auto-deprecate" : "pending",
      challengerMetric,
      incumbentMetric,
      samples,
      relativeImprovement,
      windowClosed,
    };
  }

  if (relativeImprovement >= gate.threshold) {
    return { decision: "promote", challengerMetric, incumbentMetric, samples, relativeImprovement, windowClosed };
  }

  return {
    decision: windowClosed ? "auto-deprecate" : "pending",
    challengerMetric,
    incumbentMetric,
    samples,
    relativeImprovement,
    windowClosed,
  };
}
