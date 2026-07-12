// Component registry: the passport office referenced in
// constraint-enforcement-spec.md Section 1 Stage 5. In-memory Map with
// optional pluggable persistence. Browser-safe: NO unconditional node
// imports here (M5 requirement — telemetry/gate.ts and telemetry/evolution.ts
// run in the demo page and touch the Registry directly). Node-backed JSON
// persistence lives in registry/node-persistence.ts and is injected, not
// imported by default; see that file's header comment.
import type { ComponentDefinition, ValidationRecord, VariantEntry } from "../validator/types.js";

export interface RegistryEntry {
  name: string;
  version: string;
  definition: ComponentDefinition;
  apiSignatureHash: string;
  /** Present only for components that carry a template (adaptive/generative registrations with an artifact). */
  structuralHash?: string;
  validationRecord: ValidationRecord;
  flagged: boolean;
  registeredAt: string;
}

/** Thrown when a write would leave the registry holding two incumbents for the same component + context. */
export class RegistryIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegistryIntegrityError";
  }
}

/**
 * Verify the one-incumbent-per-context invariant for a single entry's
 * variant list. A component's variants each declare `contextPreference`
 * (the contexts they apply to); a variant with no `contextPreference` is
 * treated as applying globally, i.e. to every context any sibling variant
 * names (or to a single implicit "*" bucket if no variant names any
 * context at all).
 */
function checkIncumbentInvariant(entry: RegistryEntry): void {
  const variants = entry.definition.variants;
  if (!variants || variants.length === 0) return;

  const namedContexts = new Set<string>();
  for (const v of variants) {
    for (const c of v.contextPreference ?? []) namedContexts.add(c);
  }
  const contextBuckets = namedContexts.size > 0 ? Array.from(namedContexts) : ["*"];

  for (const context of contextBuckets) {
    const incumbents = variants.filter(
      (v) =>
        v.status === "incumbent" &&
        (v.contextPreference === undefined || v.contextPreference.includes(context))
    );
    if (incumbents.length > 1) {
      throw new RegistryIntegrityError(
        `Registry integrity violation: component "${entry.name}" would have ${incumbents.length} incumbent variants ` +
          `(${incumbents.map((v) => v.name).join(", ")}) for context "${context}". At most one incumbent per component per context is allowed.`
      );
    }
  }
}

/**
 * Pluggable persistence. The Registry class never imports node:fs directly —
 * a node-backed implementation (registry/node-persistence.ts) is injected by
 * callers that run in node; browser callers (the demo page, gate.ts,
 * evolution.ts) simply omit it and get a pure in-memory registry.
 */
export interface RegistryPersistence {
  load(): RegistryEntry[];
  save(entries: RegistryEntry[]): void;
}

/** One status update: flip a single variant's status. Applied in a batch — see `updateVariantStatuses`. */
export interface VariantStatusUpdate {
  variantName: string;
  status: VariantEntry["status"];
}

export class Registry {
  private entries = new Map<string, RegistryEntry>();

  constructor(private readonly persistence?: RegistryPersistence) {
    if (this.persistence) {
      for (const entry of this.persistence.load()) this.entries.set(entry.name, entry);
    }
  }

  /** Register (or overwrite) an entry. Throws RegistryIntegrityError before any state changes if the invariant would be violated. */
  register(entry: RegistryEntry): void {
    checkIncumbentInvariant(entry);
    this.entries.set(entry.name, entry);
    this.save();
  }

  /**
   * Apply one or more variant status changes to an existing entry's
   * definition in a SINGLE write, so the incumbent invariant is checked
   * against the final post-transaction state only — two incumbents mid-
   * transaction must be structurally impossible, not merely caught after
   * the fact. Used by telemetry/evolution.ts for promotion (challenger ->
   * incumbent, former incumbent -> deprecated) and auto-deprecation.
   * Throws RegistryIntegrityError (and leaves the registry untouched) if the
   * resulting variant list would violate the one-incumbent-per-context rule.
   */
  updateVariantStatuses(componentName: string, updates: VariantStatusUpdate[]): RegistryEntry {
    const existing = this.entries.get(componentName);
    if (!existing) {
      throw new Error(`updateVariantStatuses: component "${componentName}" is not registered.`);
    }
    const updateByName = new Map(updates.map((u) => [u.variantName, u.status]));
    const nextVariants = (existing.definition.variants ?? []).map((v) => {
      const nextStatus = updateByName.get(v.name);
      return nextStatus ? { ...v, status: nextStatus } : v;
    });
    const nextEntry: RegistryEntry = {
      ...existing,
      definition: { ...existing.definition, variants: nextVariants },
    };
    checkIncumbentInvariant(nextEntry);
    this.entries.set(componentName, nextEntry);
    this.save();
    return nextEntry;
  }

  get(name: string): RegistryEntry | undefined {
    return this.entries.get(name);
  }

  has(name: string): boolean {
    return this.entries.has(name);
  }

  /** Registered AND not flagged — flagged components are excluded from AI composition (non-negotiable #4). */
  isComposable(name: string): boolean {
    const entry = this.entries.get(name);
    return entry !== undefined && !entry.flagged;
  }

  all(): RegistryEntry[] {
    return Array.from(this.entries.values());
  }

  private save(): void {
    if (!this.persistence) return;
    this.persistence.save(Array.from(this.entries.values()));
  }
}
