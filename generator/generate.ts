// Definition -> Web Component source. Deterministic, archetype-based. NO
// LLM involvement (AI generates *definitions* in M5; definition->source
// here is mechanical, see CLAUDE.md's generator architecture note).

import type { ComponentDefinition } from "../validator/types.js";
import { generateBadgeComponent } from "./archetypes/badge.js";
import { generateButtonComponent } from "./archetypes/button.js";
import { generateCheckboxComponent } from "./archetypes/checkbox.js";
import { generateFormFieldComponent } from "./archetypes/form-field.js";
import { generateLabelComponent } from "./archetypes/label.js";
import { generateSearchBarComponent } from "./archetypes/search-bar.js";
import { generateTextInputComponent } from "./archetypes/text-input.js";

export interface GeneratedComponent {
  source: string;
  template: string;
  css: string;
}

type Archetype = "button" | "label" | "badge" | "text-input" | "checkbox" | "form-field" | "search-bar";

/**
 * Select an archetype from `definition.usage.designPatterns` (preferred) or
 * `definition.name` (fallback). An unknown archetype is a clear, named error
 * rather than a silent no-op.
 */
function selectArchetype(definition: ComponentDefinition): Archetype {
  const patterns = definition.usage?.designPatterns ?? [];
  if (patterns.includes("form-action") || patterns.includes("call-to-action") || definition.name === "ds-button") {
    return "button";
  }
  if (patterns.includes("form-label") || definition.name === "ds-label") {
    return "label";
  }
  if (patterns.includes("status-indicator") || definition.name === "ds-badge") {
    return "badge";
  }
  if (definition.name === "ds-checkbox") {
    return "checkbox";
  }
  if (definition.name === "ds-form-field") {
    return "form-field";
  }
  if (definition.name === "ds-search-bar") {
    return "search-bar";
  }
  if (patterns.includes("form-control") || definition.name === "ds-text-input") {
    return "text-input";
  }
  throw new Error(
    `generateComponent: no archetype registered for definition "${definition.name}" ` +
      `(usage.designPatterns=[${patterns.join(", ")}]).`
  );
}

export function generateComponent(definition: ComponentDefinition): GeneratedComponent {
  const archetype = selectArchetype(definition);
  switch (archetype) {
    case "button":
      return generateButtonComponent(definition);
    case "label":
      return generateLabelComponent(definition);
    case "badge":
      return generateBadgeComponent(definition);
    case "text-input":
      return generateTextInputComponent(definition);
    case "checkbox":
      return generateCheckboxComponent(definition);
    case "form-field":
      return generateFormFieldComponent(definition);
    case "search-bar":
      return generateSearchBarComponent(definition);
  }
}
