// Manifest for the P2 adversarial suite. Each entry names a fixture file and
// the pipeline outcome it must produce: which stage rejects it, and either
// the module name (for stage 1/2 rejections, which have no constraintId) or
// the failing constraint's id (for stage 3 rejections, dispatched through
// stage3-constraints.ts but attributable to one module's constraint).
//
// `setup` names a pre-registration fixture some cases need (e.g. mutate
// candidates against an already-registered component); the test file
// interprets it. `skip` marks the two Stage 4 / M3 fixtures that this
// manifest only *carries* — they are not run through the pipeline in M2.

export type ExpectedRejection =
  | { stage: 1 | 2; module: string; constraintId?: null }
  | { stage: 3; module: "stage3-constraints"; constraintId: string }
  | { stage: 4; module: string; constraintId: string; messageContains?: string };

export type Setup = "none" | "register-ds-button" | "register-fixed" | "register-loosen-base";

export interface AdversarialCase {
  /** Descriptive name, matches the fixture filename without extension. */
  name: string;
  file: string;
  cssFile?: string;
  /** Hand-authored "generated-shaped" JS fixture (Candidate.source) for Stage 4 cases that need a live instance. */
  sourceFile?: string;
  /** Set for the contrast fixture: signals the test harness to inject synthetic contrastPair token data instead of the real tokens.json. */
  useSyntheticContrastTokens?: boolean;
  requestType: "register" | "mutate";
  setup: Setup;
  /** Template string to attach to the candidate, when the case depends on structural-hash matching. */
  template?: string;
  expected: ExpectedRejection | { skip: string };
}

export const BUTTON_TEMPLATE = "<button><slot name=\"icon\"></slot><slot></slot></button>";
export const GENERIC_TEMPLATE = "<div><slot></slot></div>";

export const adversarialManifest: AdversarialCase[] = [
  {
    name: "primitive-token-reference",
    file: "primitive-token-reference.json",
    cssFile: "primitive-token-reference.css",
    requestType: "register",
    setup: "none",
    expected: { stage: 3, module: "stage3-constraints", constraintId: "token-wall" },
  },
  {
    name: "contrast-failure-one-context",
    file: "contrast-failure-one-context.json",
    cssFile: "contrast-failure-one-context.css",
    sourceFile: "contrast-failure-one-context.js",
    useSyntheticContrastTokens: true,
    requestType: "register",
    setup: "none",
    expected: { stage: 4, module: "stage4-accessibility-contrast", constraintId: "contrast-a11y", messageContains: "enterprise-saas" },
  },
  {
    name: "api-signature-drift-adaptive",
    file: "api-signature-drift-adaptive.json",
    requestType: "mutate",
    setup: "register-ds-button",
    template: BUTTON_TEMPLATE,
    expected: { stage: 1, module: "stage1-gatekeeping" },
  },
  {
    name: "mutation-of-fixed",
    file: "mutation-of-fixed.json",
    requestType: "mutate",
    setup: "register-fixed",
    expected: { stage: 1, module: "stage1-gatekeeping" },
  },
  {
    name: "unregistered-child",
    file: "unregistered-child.json",
    requestType: "register",
    setup: "none",
    expected: { stage: 3, module: "stage3-constraints", constraintId: "orphan-composition" },
  },
  {
    name: "missing-justification-ai",
    file: "missing-justification-ai.json",
    requestType: "register",
    setup: "none",
    expected: { stage: 2, module: "stage2-schema" },
  },
  {
    name: "unknown-constraint-type",
    file: "unknown-constraint-type.json",
    requestType: "register",
    setup: "none",
    expected: { stage: 2, module: "stage2-schema" },
  },
  {
    name: "slot-content-violation",
    file: "slot-content-violation.json",
    sourceFile: "slot-content-violation.js",
    requestType: "register",
    setup: "none",
    expected: { stage: 4, module: "stage4-composition", constraintId: "slot-composition", messageContains: "icon" },
  },
  {
    name: "flag-empty-rationale",
    file: "flag-empty-rationale.json",
    cssFile: "flag-empty-rationale.css",
    requestType: "register",
    setup: "none",
    expected: { stage: 3, module: "stage3-constraints", constraintId: "flag-no-rationale" },
  },
  {
    name: "ai-mutability-loosening",
    file: "ai-mutability-loosening.json",
    requestType: "mutate",
    setup: "register-loosen-base",
    template: GENERIC_TEMPLATE,
    expected: { stage: 3, module: "stage3-constraints", constraintId: "loosen-mutability-class" },
  },
  {
    name: "whitespace-only-justification",
    file: "whitespace-only-justification.json",
    requestType: "register",
    setup: "none",
    expected: { stage: 2, module: "stage2-schema" },
  },
];
