// Definition -> Web Component source. Deterministic, archetype-based. NO
// LLM involvement (AI generates *definitions* in M5; definition->source
// here is mechanical, see CLAUDE.md's generator architecture note).

import type { ComponentDefinition } from "../validator/types.js";
import { generateButtonComponent } from "./archetypes/button.js";

export interface GeneratedComponent {
  source: string;
  template: string;
  css: string;
}

type Archetype = "button";

/**
 * Select an archetype from `definition.usage.designPatterns` (preferred) or
 * `definition.name` (fallback). Only the button archetype exists in M3; an
 * unknown archetype is a clear, named error rather than a silent no-op.
 */
function selectArchetype(definition: ComponentDefinition): Archetype {
  const patterns = definition.usage?.designPatterns ?? [];
  if (patterns.includes("form-action") || patterns.includes("call-to-action")) {
    return "button";
  }
  if (definition.name === "ds-button") {
    return "button";
  }
  throw new Error(
    `generateComponent: no archetype registered for definition "${definition.name}" ` +
      `(usage.designPatterns=[${patterns.join(", ")}]). Only the button archetype exists in M3.`
  );
}

export function generateComponent(definition: ComponentDefinition): GeneratedComponent {
  const archetype = selectArchetype(definition);
  switch (archetype) {
    case "button":
      return generateButtonComponent(definition);
  }
}
