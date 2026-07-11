// Component registry: the passport office referenced in
// constraint-enforcement-spec.md Section 1 Stage 5. In-memory Map with
// optional JSON-file persistence. The incumbent invariant (one incumbent per
// component per context) is enforced on every write, never assumed.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ComponentDefinition, ValidationRecord } from "../validator/types.js";

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

export class Registry {
  private entries = new Map<string, RegistryEntry>();

  constructor(private readonly persistPath?: string) {
    if (this.persistPath && existsSync(this.persistPath)) {
      this.load();
    }
  }

  /** Register (or overwrite) an entry. Throws RegistryIntegrityError before any state changes if the invariant would be violated. */
  register(entry: RegistryEntry): void {
    checkIncumbentInvariant(entry);
    this.entries.set(entry.name, entry);
    this.save();
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
    if (!this.persistPath) return;
    const dir = dirname(this.persistPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const serializable = Array.from(this.entries.values());
    writeFileSync(this.persistPath, JSON.stringify(serializable, null, 2), "utf-8");
  }

  private load(): void {
    if (!this.persistPath) return;
    const raw = readFileSync(this.persistPath, "utf-8");
    const parsed = JSON.parse(raw) as RegistryEntry[];
    for (const entry of parsed) this.entries.set(entry.name, entry);
  }
}
