// THE SEAM (CLAUDE.md M5): generateDefinition's signature is what a live LLM
// backend would implement — take a StructuredRequirement, return a
// ComponentDefinition. The POC backend is a recorded corpus (deterministic,
// no API keys, safe for CI): every requirement in test/generation/requirements
// has a hand-authored, good-faith AI-authored attempt recorded in
// test/generation/attempts. `generateDefinition` is a pure lookup against
// that corpus. Swapping the POC backend for a real model call means
// replacing this function's body with an LLM call site; every caller
// (test/generation/p3.test.ts, demo/build-demo-data.ts, the demo page) is
// already written against the (requirement, corpus) -> definition contract
// and would not need to change.

import type { StructuredRequirement } from "./requirement.js";
import type { ComponentDefinition } from "../validator/types.js";

/** Maps requirement id -> the definition an AI designer produced for it. */
export type GenerationCorpus = Record<string, ComponentDefinition>;

export class UnknownRequirementError extends Error {
  constructor(requirementId: string) {
    super(`generateDefinition: no corpus entry for requirement id "${requirementId}".`);
    this.name = "UnknownRequirementError";
  }
}

/**
 * Look up the recorded definition for `requirement.id`. In a live backend
 * this is where the requirement would be sent to a model; here it is a
 * deterministic corpus lookup so tests and the demo's build step never make
 * a network call.
 */
export function generateDefinition(requirement: StructuredRequirement, corpus: GenerationCorpus): ComponentDefinition {
  const definition = corpus[requirement.id];
  if (!definition) {
    throw new UnknownRequirementError(requirement.id);
  }
  return definition;
}
