// Core types for the M2 enforcement pipeline. See specs/constraint-enforcement-spec.md
// Sections 1-4 for the contract these types encode. Prose fields on a definition
// (description, rationale, justification, ...) are never read here for logic;
// they exist for human/AI comprehension only (CLAUDE.md rule #6).

/**
 * A candidate submitted to the pipeline. `definition` is `unknown` until Stage 2
 * (ajv) validates it against the schema; every stage after that may safely treat
 * it as a `ComponentDefinition`. `css`/`template` are optional generated
 * artifacts — Stage 3's token-usage module short-circuits (with a note) when
 * `css` is absent.
 */
export type RequestType = "register" | "mutate";

export interface Candidate {
  definition: unknown;
  css?: string;
  template?: string;
  requestType: RequestType;
}

/** Stage numbers in pipeline order. See constraint-enforcement-spec.md Section 1. */
export type StageNumber = 1 | 2 | 3 | 4 | 5;

/**
 * A single rejection or warning. Every instance MUST carry a non-empty
 * `message` and `sourceSpan` — P2 requires records naming the failing
 * constraint id and source span (success-criteria.md P2).
 */
export interface RejectionDetail {
  stage: StageNumber;
  module: string;
  constraintId: string | null;
  message: string;
  /**
   * A JSON path into the definition (e.g. "constraints[2].type") for
   * definition-shaped failures, or a css location ("css:line:col", or the
   * offending substring plus its character index) for css-shaped failures.
   */
  sourceSpan: string;
}

export interface StageResult {
  stage: StageNumber;
  name: string;
  passed: boolean;
  /** Human-readable notes recorded even on a pass (e.g. deferrals to Stage 4). */
  notes: string[];
}

export interface ValidationRecord {
  candidateName: string | null;
  passed: boolean;
  outcome: "registered" | "flagged" | "rejected";
  stages: StageResult[];
  rejection?: RejectionDetail;
  warnings: RejectionDetail[];
  timestamp: string;
}

// -----------------------------------------------------------------------
// Typed component definition, mirroring specs/component-definition.schema.json.
// This is intentionally a hand-written mirror (not generated from the schema)
// so Stage 3+ modules get real TypeScript types once ajv has validated shape.
// -----------------------------------------------------------------------

export type Mutability = "fixed" | "adaptive" | "generative";
export type ComponentType = "atom" | "molecule" | "organism";
export type ConstraintType =
  | "token-usage"
  | "accessibility"
  | "composition"
  | "mutability"
  | "performance"
  | "api-stability";
export type FailureBehavior = "reject" | "flag";

export interface ApiProperty {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array";
  required: boolean;
  default?: unknown;
  enum?: unknown[];
  description?: string;
}

export interface ApiSlot {
  name: string;
  allowedElements?: string[];
  description?: string;
}

export interface ApiEvent {
  name: string;
  detailSchema?: Record<string, unknown>;
  description?: string;
}

export interface ComponentApi {
  properties: ApiProperty[];
  slots?: ApiSlot[];
  events?: ApiEvent[];
}

export interface TokensBlock {
  consumes: string[];
}

export interface VariantEntry {
  name: string;
  description?: string;
  contextPreference?: string[];
  status: "incumbent" | "challenger" | "deprecated";
}

export interface CompositionBlock {
  allowedChildren?: string[];
  allowedParents?: string[];
  maxInstancesPerParent?: number;
}

export interface ConstraintEntry {
  id: string;
  type: ConstraintType;
  rule: Record<string, unknown>;
  failureBehavior: FailureBehavior;
  rationale?: string;
}

export interface EvolutionBlock {
  supersedes?: string;
  gate: {
    metric: "task-completion-rate" | "interaction-error-rate" | "time-to-interaction" | "abandonment-rate";
    threshold: number;
    minSamples: number;
    windowDays?: number;
  };
}

export interface PerformanceBudget {
  renderMs?: number;
  interactionMs?: number;
  bundleKb?: number;
}

export interface Provenance {
  author: "human" | "ai";
  model?: string;
  createdAt: string;
  approvedBy?: string;
  justification?: string;
}

// -----------------------------------------------------------------------
// Stage 3 module contract. Every constraint module inspects one constraint
// entry (plus whatever candidate artifacts it needs) and returns violations.
// `hard: true` means the violation is rejected regardless of the
// constraint's `failureBehavior` (today, only the primitive-tier wall in
// token-usage sets this — non-negotiable #1).
// `severity` is a module-pinned outcome where the spec assigns one to a
// specific check (Section 3: a raw color literal "is a rejection", a
// border-radius literal "is a flag") — it overrides the constraint's
// declared `failureBehavior` in both directions. Violations with neither
// field are "soft": the dispatcher applies `failureBehavior` semantics.
// -----------------------------------------------------------------------

export interface ModuleViolation {
  constraintId: string;
  message: string;
  sourceSpan: string;
  hard?: boolean;
  severity?: "reject" | "flag";
}

export interface ModuleResult {
  violations: ModuleViolation[];
  notes: string[];
}

export interface ComponentDefinition {
  name: string;
  version: string;
  componentType: ComponentType;
  mutability: Mutability;
  description: string;
  usage?: {
    contexts?: string[];
    designPatterns?: string[];
  };
  api: ComponentApi;
  tokens: TokensBlock;
  variants?: VariantEntry[];
  composition?: CompositionBlock;
  constraints: ConstraintEntry[];
  evolution?: EvolutionBlock;
  performanceBudget?: PerformanceBudget;
  provenance: Provenance;
}
