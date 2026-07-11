// Stage 1: gatekeeping. Mutability and identity checks, cheapest checks
// first — this stage runs BEFORE schema parsing (constraint-enforcement-spec.md
// Section 2), so every read here is defensive against `candidate.definition`
// being `unknown`, possibly malformed, JSON.

import type { Registry } from "../registry/registry.js";
import { apiSignatureHash, structuralHash } from "./hash.js";
import type { Candidate, RejectionDetail, StageResult } from "./types.js";

export interface Stage1Outcome {
  stageResult: StageResult;
  rejection?: RejectionDetail;
}

const MODULE = "stage1-gatekeeping";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Read `definition.name` defensively — the definition has not passed schema validation yet. */
export function readClaimedName(definition: unknown): string | null {
  if (!isPlainObject(definition)) return null;
  const name = definition["name"];
  return typeof name === "string" ? name : null;
}

function readClaimedMutability(definition: unknown): string | null {
  if (!isPlainObject(definition)) return null;
  const mutability = definition["mutability"];
  return typeof mutability === "string" ? mutability : null;
}

function readClaimedApi(definition: unknown): unknown {
  if (!isPlainObject(definition)) return undefined;
  return definition["api"];
}

function readEvolutionSupersedes(definition: unknown): string | null {
  if (!isPlainObject(definition)) return null;
  const evolution = definition["evolution"];
  if (!isPlainObject(evolution)) return null;
  const supersedes = evolution["supersedes"];
  return typeof supersedes === "string" ? supersedes : null;
}

function reject(constraintId: string | null, message: string, sourceSpan: string): Stage1Outcome {
  const rejection: RejectionDetail = { stage: 1, module: MODULE, constraintId, message, sourceSpan };
  return {
    rejection,
    stageResult: { stage: 1, name: MODULE, passed: false, notes: [message] },
  };
}

function pass(notes: string[] = []): Stage1Outcome {
  return { stageResult: { stage: 1, name: MODULE, passed: true, notes } };
}

export function runStage1(candidate: Candidate, registry: Registry): Stage1Outcome {
  const claimedName = readClaimedName(candidate.definition);

  if (candidate.requestType === "mutate") {
    if (claimedName === null) {
      return reject(null, "Mutate request has no readable 'name' field; cannot resolve a registry target.", "name");
    }
    const registryEntry = registry.get(claimedName);
    if (!registryEntry) {
      return reject(
        null,
        `Mutate request targets "${claimedName}", which is not registered.`,
        "name"
      );
    }

    if (registryEntry.definition.mutability === "fixed") {
      return reject(
        null,
        `Component "${claimedName}" is mutability "fixed"; mutation requests are rejected before schema parsing. The only path to change is a human-authored definition with a version bump.`,
        "requestType"
      );
    }

    if (registryEntry.definition.mutability === "adaptive") {
      const candidateApi = readClaimedApi(candidate.definition);
      if (candidate.template === undefined || candidateApi === undefined) {
        return reject(
          null,
          `Mutate request against adaptive component "${claimedName}" is missing template or api; structural drift cannot be ruled out.`,
          candidate.template === undefined ? "template" : "api"
        );
      }
      const candidateStructural = structuralHash(candidate.template);
      const candidateApiHash = apiSignatureHash(candidateApi);
      if (candidateStructural !== registryEntry.structuralHash) {
        return reject(
          null,
          `Mutate request against adaptive component "${claimedName}" has structural hash drift (got ${candidateStructural}, registry has ${registryEntry.structuralHash}). Only context-tier token bindings may differ.`,
          "template"
        );
      }
      if (candidateApiHash !== registryEntry.apiSignatureHash) {
        return reject(
          null,
          `Mutate request against adaptive component "${claimedName}" has API signature drift (got ${candidateApiHash}, registry has ${registryEntry.apiSignatureHash}).`,
          "api"
        );
      }
      return pass([`adaptive mutation of "${claimedName}": structural and API hashes match registry`]);
    }

    // generative: pass through to the full pipeline.
    return pass([`mutate request against generative component "${claimedName}" passes through to Stage 2+`]);
  }

  // requestType === "register"
  if (claimedName !== null && registry.has(claimedName)) {
    const claimedMutability = readClaimedMutability(candidate.definition);
    if (claimedMutability !== "generative") {
      return reject(
        null,
        `Register request claims existing name "${claimedName}" but is not a generative evolution candidate (mutability: ${claimedMutability ?? "unknown"}).`,
        "name"
      );
    }
    const supersedes = readEvolutionSupersedes(candidate.definition);
    if (!supersedes) {
      return reject(
        null,
        `Generative candidate claims existing name "${claimedName}" without declaring evolution.supersedes.`,
        "evolution.supersedes"
      );
    }
    return pass([`generative candidate for existing name "${claimedName}" declares evolution.supersedes="${supersedes}"`]);
  }

  return pass([claimedName !== null ? `register of new name "${claimedName}" passes through` : "register candidate name unresolved at Stage 1; deferred to schema validation"]);
}
