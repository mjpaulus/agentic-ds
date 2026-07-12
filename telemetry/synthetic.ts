// Seeded deterministic synthetic telemetry generator. NEVER Math.random —
// every distribution here is driven by mulberry32, a small deterministic
// PRNG, so the same seed always produces the same event stream (required for
// deterministic CI per CLAUDE.md / the M5 brief). Browser-safe: no node
// imports.

import type {
  ComponentAbandonmentEvent,
  ComponentErrorEvent,
  ComponentInteractionEvent,
  EventContext,
  TaskCompletionEvent,
  TelemetryEvent,
} from "./events.js";

/** mulberry32: tiny, fast, deterministic 32-bit PRNG. Returns a function producing floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller-ish jitter: a small pseudo-gaussian perturbation around 0, using two uniform draws. */
function jitter(rng: () => number, spread: number): number {
  const u1 = Math.max(rng(), 1e-9);
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return z * spread;
}

export interface VariantTelemetryConfig {
  variantName: string;
  /** True completion rate in [0,1], jittered per-sample. */
  completionRate: number;
  /** True per-interaction error rate in [0,1]. */
  errorRate: number;
  /** True abandonment rate in [0,1] (share of sessions that abandon rather than complete). */
  abandonmentRate: number;
  /** True mean time-to-interaction, in ms. */
  timeToInteractionMs: number;
  /** Number of sessions (samples) to generate for this variant. */
  sampleCount: number;
}

export interface SyntheticGeneratorConfig {
  componentName: string;
  context: EventContext;
  /** Seed for the PRNG. Same seed -> identical output. */
  seed: number;
  /** Window start, ms epoch. Events are spread across [windowStart, windowStart + windowMs]. */
  windowStart: number;
  windowMs: number;
  variants: VariantTelemetryConfig[];
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/**
 * Generate a plausible, deterministic event stream for one variant: one
 * component-interaction + one task-completion or component-abandonment per
 * session, plus an occasional component-error. Distributions jitter around
 * the configured "true" rates rather than hitting them exactly, so the gate
 * logic is exercised against realistic noise.
 */
function generateVariantEvents(
  cfg: SyntheticGeneratorConfig,
  variant: VariantTelemetryConfig,
  rng: () => number
): TelemetryEvent[] {
  const events: TelemetryEvent[] = [];
  const { componentName, context, windowStart, windowMs } = cfg;

  for (let i = 0; i < variant.sampleCount; i++) {
    const sessionId = `${cfg.componentName}-${variant.variantName}-${i}-${Math.floor(rng() * 1e9)}`;
    const timestamp = windowStart + Math.floor(rng() * windowMs);

    // time-to-interaction: jitter around the true mean, floor at 1ms.
    const ttiJitterMs = jitter(rng, variant.timeToInteractionMs * 0.15);
    const tti = Math.max(1, Math.round(variant.timeToInteractionMs + ttiJitterMs));

    const interaction: ComponentInteractionEvent = {
      type: "component-interaction",
      componentName,
      variantName: variant.variantName,
      context,
      sessionId,
      timestamp,
      interactionType: "activate",
      targetProperty: "value",
    };
    events.push(interaction);

    // render-to-interaction latency is carried in the payload via a
    // synthetic task-completion/duration field per spec Section 6 ("time-to-
    // interaction from render timestamps already in the performance
    // module"); for the POC synthetic generator we stash it on durationMs of
    // a dedicated micro task-completion so gate.ts can read it uniformly.
    const ttiTask: TaskCompletionEvent = {
      type: "task-completion",
      componentName,
      variantName: variant.variantName,
      context,
      sessionId,
      timestamp: timestamp + 1,
      taskId: "render-to-interaction",
      durationMs: tti,
      completed: true,
    };
    events.push(ttiTask);

    // error, jittered around the true rate.
    const errorRoll = rng();
    const errorRateJittered = clamp01(variant.errorRate + jitter(rng, variant.errorRate * 0.2));
    if (errorRoll < errorRateJittered) {
      const errorEvent: ComponentErrorEvent = {
        type: "component-error",
        componentName,
        variantName: variant.variantName,
        context,
        sessionId,
        timestamp: timestamp + 2,
        errorClass: "validation-error",
        recovered: rng() > 0.5,
      };
      events.push(errorEvent);
    }

    // completion vs abandonment, jittered around true rates.
    const completionRoll = rng();
    const completionRateJittered = clamp01(variant.completionRate + jitter(rng, variant.completionRate * 0.1));
    if (completionRoll < completionRateJittered) {
      const taskEvent: TaskCompletionEvent = {
        type: "task-completion",
        componentName,
        variantName: variant.variantName,
        context,
        sessionId,
        timestamp: timestamp + 3,
        taskId: "primary-flow",
        durationMs: Math.max(1, Math.round(1000 + jitter(rng, 200))),
        completed: true,
      };
      events.push(taskEvent);
    } else {
      const abandonmentRoll = rng();
      const abandonmentRateJittered = clamp01(variant.abandonmentRate + jitter(rng, variant.abandonmentRate * 0.1));
      if (abandonmentRoll < abandonmentRateJittered || true) {
        // Every non-completing session in this simplified POC model either
        // completes (above) or abandons — there is no third outcome, so an
        // uncompleted session always emits an abandonment event.
        const abandonEvent: ComponentAbandonmentEvent = {
          type: "component-abandonment",
          componentName,
          variantName: variant.variantName,
          context,
          sessionId,
          timestamp: timestamp + 3,
          dwellMs: Math.max(1, Math.round(500 + jitter(rng, 150))),
        };
        events.push(abandonEvent);
      }
    }
  }

  return events;
}

/** Generate a deterministic event stream for every configured variant. Same seed -> identical output. */
export function generateEvents(config: SyntheticGeneratorConfig): TelemetryEvent[] {
  const rng = mulberry32(config.seed);
  const events: TelemetryEvent[] = [];
  for (const variant of config.variants) {
    events.push(...generateVariantEvents(config, variant, rng));
  }
  return events;
}
