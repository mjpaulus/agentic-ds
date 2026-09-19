// Browser-safe actuator (CLAUDE.md M6). Only sets the `data-context`
// attribute the M1 token pipeline already reads and returns a render plan;
// it never touches component code — the demo renders the plan with the
// existing generated components, exactly as the M1 toggle already does.

import type { AdaptationDecision } from "./decider.js";
import type { ContextId } from "./contract.js";

export interface RenderPlan {
  context: ContextId;
  /** Whether applyDecision actually flipped data-context (false for 'suggest' and 'keep'). */
  flipped: boolean;
  components: string[];
  destructive: boolean;
  needsGuidance: boolean;
  gapDetected: boolean;
}

export function applyDecision(decision: AdaptationDecision, doc: Document): RenderPlan {
  let flipped = false;
  if (decision.contextAction === "apply") {
    doc.documentElement.setAttribute("data-context", decision.contextChoice);
    flipped = true;
  }
  const context = doc.documentElement.getAttribute("data-context") as ContextId;
  return {
    context,
    flipped,
    components: decision.components,
    destructive: decision.destructive,
    needsGuidance: decision.needsGuidance,
    gapDetected: decision.gapDetected,
  };
}
