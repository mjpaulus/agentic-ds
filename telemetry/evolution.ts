// The registry transaction half of the evolution gate
// (constraint-enforcement-spec.md Section 5). Browser-safe: NO node imports
// — `revalidate` is injected so this file never needs to know how
// revalidation actually runs (node-side wiring lives in telemetry/node.ts).

import type { Registry, RegistryEntry, VariantStatusUpdate } from "../registry/registry.js";
import type { ComponentDefinition, ValidationRecord, VariantEntry } from "../validator/types.js";

export type RevalidateFn = (definition: ComponentDefinition) => Promise<ValidationRecord>;

export interface PromoteChallengerInput {
  registry: Registry;
  componentName: string;
  challengerVariant: string;
  /** Injected: re-runs Stages 2-4 against the CURRENT definition/tokens/constraints. See telemetry/node.ts's revalidateViaPipeline for the node-side implementation. */
  revalidate: RevalidateFn;
}

export interface PromoteChallengerResult {
  promoted: boolean;
  record: ValidationRecord;
  entry?: RegistryEntry;
  reason?: string;
}

function findVariant(entry: RegistryEntry, name: string): VariantEntry | undefined {
  return entry.definition.variants?.find((v) => v.name === name);
}

/** Undefined contextPreference means "applies globally" (see registry.ts's checkIncumbentInvariant). */
function contextsOverlap(a?: string[], b?: string[]): boolean {
  if (!a || !b) return true;
  return a.some((c) => b.includes(c));
}

/**
 * Promote a challenger variant to incumbent. Per Section 5: "Promotion is
 * itself a pipeline event ... the promoted definition re-runs Stages 2
 * through 4 before the registry flips, because a challenger validated three
 * weeks ago validates against three-week-old tokens." If revalidation fails,
 * promotion aborts and the challenger stays a challenger — no partial state.
 * On success, the challenger -> incumbent and the former incumbent(s) for
 * the same context -> deprecated flip in a SINGLE registry write
 * (registry.updateVariantStatuses), so the one-incumbent-per-context
 * invariant is checked only against the final state.
 */
export async function promoteChallenger(input: PromoteChallengerInput): Promise<PromoteChallengerResult> {
  const { registry, componentName, challengerVariant, revalidate } = input;
  const entry = registry.get(componentName);
  if (!entry) {
    throw new Error(`promoteChallenger: component "${componentName}" is not registered.`);
  }
  const challenger = findVariant(entry, challengerVariant);
  if (!challenger) {
    throw new Error(`promoteChallenger: variant "${challengerVariant}" does not exist on "${componentName}".`);
  }
  if (challenger.status !== "challenger") {
    throw new Error(
      `promoteChallenger: variant "${challengerVariant}" is not a challenger (status: "${challenger.status}").`
    );
  }

  const record = await revalidate(entry.definition);

  if (!record.passed) {
    return { promoted: false, record, reason: "revalidation failed; challenger stays a challenger, registry untouched" };
  }

  const formerIncumbents = (entry.definition.variants ?? []).filter(
    (v) => v.status === "incumbent" && contextsOverlap(v.contextPreference, challenger.contextPreference)
  );

  const updates: VariantStatusUpdate[] = [
    { variantName: challenger.name, status: "incumbent" },
    ...formerIncumbents.map((v) => ({ variantName: v.name, status: "deprecated" as const })),
  ];

  const updatedEntry = registry.updateVariantStatuses(componentName, updates);

  return { promoted: true, record, entry: updatedEntry };
}

export interface DeprecateChallengerInput {
  registry: Registry;
  componentName: string;
  challengerVariant: string;
  reason: string;
}

export interface DeprecateChallengerResult {
  entry: RegistryEntry;
  reason: string;
}

/** Auto-deprecate a challenger whose gate window closed without a win. No draw state, no re-litigation: deprecated is terminal. */
export function deprecateChallenger(input: DeprecateChallengerInput): DeprecateChallengerResult {
  const { registry, componentName, challengerVariant, reason } = input;
  const entry = registry.get(componentName);
  if (!entry) {
    throw new Error(`deprecateChallenger: component "${componentName}" is not registered.`);
  }
  const challenger = findVariant(entry, challengerVariant);
  if (!challenger) {
    throw new Error(`deprecateChallenger: variant "${challengerVariant}" does not exist on "${componentName}".`);
  }
  const updatedEntry = registry.updateVariantStatuses(componentName, [
    { variantName: challengerVariant, status: "deprecated" },
  ]);
  return { entry: updatedEntry, reason };
}
