// Stage 2: schema validation. ajv strict mode, draft 2020-12, against
// specs/component-definition.schema.json loaded from disk (never edited —
// see CLAUDE.md hard rules).

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import type { ErrorObject, ValidateFunction } from "ajv";
import type { ComponentDefinition, RejectionDetail, StageResult } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = resolve(__dirname, "../specs/component-definition.schema.json");

const MODULE = "stage2-schema";

let cachedValidator: ValidateFunction | undefined;

function getValidator(): ValidateFunction {
  if (cachedValidator) return cachedValidator;
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf-8"));
  // strict: true turns on every strict* flag (strictSchema, strictTypes,
  // strictRequired, ...). The spec schema's `allOf[0].then` and
  // `properties.provenance.then` re-list fields in `required` that are
  // already required elsewhere (redundant but intentional — see CLAUDE.md:
  // "do NOT edit the spec schema file"), which trips ajv's `strictRequired`
  // check. That one flag is relaxed to `false` (silently allowed) so the
  // rest of strict mode still applies; "log" would still print a warning
  // per redundant-required field on every schema compile.
  const ajv = new Ajv2020({ strict: true, strictRequired: false, allErrors: true });
  addFormats(ajv);
  cachedValidator = ajv.compile(schema);
  return cachedValidator;
}

export interface Stage2Outcome {
  stageResult: StageResult;
  rejection?: RejectionDetail;
  /** The definition, narrowed to ComponentDefinition, only present on a pass. */
  definition?: ComponentDefinition;
}

function formatAjvError(err: ErrorObject): string {
  const path = err.instancePath || "(root)";
  return `${path} ${err.message ?? "failed schema validation"}`;
}

export function runStage2(definition: unknown): Stage2Outcome {
  const validate = getValidator();
  const valid = validate(definition);

  if (!valid) {
    const errors = validate.errors ?? [];
    const first = errors[0];
    const sourceSpan = first && first.instancePath ? first.instancePath : "(root)";
    const message = errors.length > 0
      ? `Schema validation failed: ${errors.map(formatAjvError).join("; ")}`
      : "Schema validation failed for an unknown reason.";
    const rejection: RejectionDetail = {
      stage: 2,
      module: MODULE,
      constraintId: null,
      message,
      sourceSpan,
    };
    return {
      rejection,
      stageResult: { stage: 2, name: MODULE, passed: false, notes: [message] },
    };
  }

  return {
    stageResult: { stage: 2, name: MODULE, passed: true, notes: ["definition validates against component-definition.schema.json"] },
    definition: definition as ComponentDefinition,
  };
}
