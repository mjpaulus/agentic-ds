// The structured-form requirement input (success-criteria.md P3 / the demo
// script's step 2): a machine shape, not free prose. `validateRequirement`
// is ajv-strict against `requirementSchema`, mirroring how Stage 2 of the
// validator treats component-definition.schema.json — a requirement that
// doesn't validate never reaches generateDefinition.

import Ajv2020 from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv";

export interface RequirementProperty {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array";
  values?: string[];
}

export interface StructuredRequirement {
  /** Requirement id, used to look the definition up in a corpus. Distinct from the eventual component name (name may collide across draft iterations; id never does). */
  id: string;
  /** Custom element name, e.g. "ds-tag". */
  name: string;
  componentType: "atom" | "molecule";
  purpose: string;
  properties: RequirementProperty[];
  interactions: string[];
  states: string[];
  contexts: string[];
  needsValidationBehavior?: boolean;
}

export const requirementSchema = {
  $id: "https://agentic-ds.dev/schemas/structured-requirement/1.0.0",
  type: "object",
  additionalProperties: false,
  required: ["id", "name", "componentType", "purpose", "properties", "interactions", "states", "contexts"],
  properties: {
    id: { type: "string", pattern: "^[a-z][a-z0-9-]*$" },
    name: { type: "string", pattern: "^[a-z][a-z0-9]*(-[a-z0-9]+)+$" },
    componentType: { enum: ["atom", "molecule"] },
    purpose: { type: "string", minLength: 1, maxLength: 500 },
    properties: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "type"],
        properties: {
          name: { type: "string", pattern: "^[a-z][a-zA-Z0-9]*$" },
          type: { enum: ["string", "number", "boolean", "object", "array"] },
          values: { type: "array", items: { type: "string" } },
        },
      },
    },
    interactions: { type: "array", items: { type: "string" } },
    states: { type: "array", items: { type: "string" } },
    contexts: { type: "array", items: { enum: ["consumer-web", "enterprise-saas", "dashboard"] }, minItems: 1 },
    needsValidationBehavior: { type: "boolean" },
  },
} as const;

let cachedValidator: ValidateFunction | undefined;

function getValidator(): ValidateFunction {
  if (cachedValidator) return cachedValidator;
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  cachedValidator = ajv.compile(requirementSchema);
  return cachedValidator;
}

export interface RequirementValidationResult {
  valid: boolean;
  errors: string[];
}

/** ajv-validate a raw requirement payload (e.g. from the demo form) against requirementSchema. */
export function validateRequirement(payload: unknown): RequirementValidationResult {
  const validate = getValidator();
  const valid = validate(payload);
  if (valid) return { valid: true, errors: [] };
  const errors = (validate.errors ?? []).map((e) => `${e.instancePath || "(root)"} ${e.message ?? "invalid"}`);
  return { valid: false, errors };
}
