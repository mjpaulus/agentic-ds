// THE REVIEWABLE FILE (CLAUDE.md M6 / Section 7 "The Runtime Seam"). Jev
// (TypeSafe's jev model) is middleware behind the AdaptationDecider seam
// (adaptation/decider.ts); this file is the part of that middleware that is
// design-system content, not implementation detail: the exact questions we
// ask, the thresholds we act on, and the model version they are tuned
// against. Change any of the three and you are changing the contract, not
// tuning a knob — treat edits here like a token or schema change.
//
// One speculative fan-out call (patterns_fan-out.md): every question below
// goes into a SINGLE systemOne request, because Jev evaluates all questions
// against the same `state` in parallel and packing them together is both
// cheaper and keeps every lever's answer mutually consistent with one
// read of the task.

/**
 * Pinned, not aliased. jev-1.13.0's jaggedness (literal reading, no numeric
 * precision, no date reasoning) and confidence calibration are specific to
 * this version; thresholds tuned against it would silently drift under
 * "jev-latest" when TypeSafe ships jev-1.14. Bump this deliberately, re-tune
 * THRESHOLDS, and re-record fixtures when that happens.
 */
export const ADAPTATION_MODEL = "jev-1.13.0";

/** Bump when buildQuestions/resolveAdaptation's shape changes in a way that invalidates recorded fixtures. */
export const CONTRACT_VERSION = "1.0.0";

/** name + human-readable purpose, straight from a component's definition — never its prose fields beyond this (non-negotiable #6: this is catalog data, not a rule). */
export interface CatalogEntry {
  name: string;
  purpose: string;
}

export type ContextId = "consumer-web" | "enterprise-saas";

/**
 * Thresholds are the only place confidence gating happens. Tuned
 * conservatively against jev-1.13.0: this model is well-calibrated but
 * literal (model-jaggedness_jev-1.13.md), so we require a wide margin
 * before auto-applying a layout change and a narrower one before merely
 * suggesting it.
 */
export const THRESHOLDS = {
  /** Choice confidence at/above which context switches WITHOUT asking. */
  contextAutoApply: 0.75,
  /** Choice confidence at/above which we offer a switch but don't apply it. Below this: keep. */
  contextSuggest: 0.5,
  /** Per-component Noul probability at/above which a component is included in the render plan. */
  componentRelevant: 0.6,
  /** is_destructive Noul probability at/above which the danger variant + confirmation step apply. */
  destructive: 0.7,
  /** gap Noul probability at/above which we report no registered component fits the task. */
  gap: 0.6,
  /** needs_guidance Noul probability at/above which progressive disclosure / guided mode applies. */
  needsGuidance: 0.6,
} as const;

export type Thresholds = typeof THRESHOLDS;

/** Prefix used for the one-Noul-per-component questions, so decider.ts can pick them back out of the flat answers map without guessing. */
export const COMPONENT_QUESTION_PREFIX = "component:";

export interface QuestionCriteria {
  what: string;
  not_for: string;
  examples: string;
}

/** Plain-JSON question shapes matching api.md's Noul/Choice types — shared by the live backend, the recorded backend, and tests, so nobody hand-rolls a divergent copy. */
export type QuestionShape =
  | { type: "noul"; instructions: string; criteria?: { true?: string; false?: string } }
  | { type: "choice"; instructions: string; criteria: Record<string, unknown> };

export type QuestionMap = Record<string, QuestionShape>;

const CONTEXT_CRITERIA: Record<ContextId, QuestionCriteria> = {
  "consumer-web": {
    what: "A casual, low-frequency, forgiving, guided experience for an individual end user doing something occasional.",
    not_for: "Repeated expert workflows, dense data operations, or anything a trained operator does many times a day.",
    examples: "Signing up for a newsletter, browsing a storefront, filling out a one-off contact form.",
  },
  "enterprise-saas": {
    what: "A dense, repeated, expert, precise experience for a trained operator doing the same task many times.",
    not_for: "A first-time casual visitor's occasional, low-stakes action.",
    examples: "Reconciling invoices against purchase orders, bulk-editing records, running the same report every week.",
  },
};

/**
 * ONE fan-out call's worth of questions. `catalog` is the registry's
 * composable components (name + description from their definitions) — the
 * per-component Nouls are absolute per-option questions (not a single
 * Choice) because several components can be relevant to one task and a
 * Choice always picks exactly one option (the "gap" question below exists
 * for the same reason: existence, not selection).
 */
export function buildQuestions(catalog: CatalogEntry[]): QuestionMap {
  const questions: QuestionMap = {
    context: {
      type: "choice",
      instructions:
        "Which interface context fits the work described in `task`: a casual consumer context or a dense enterprise context?",
      criteria: {
        "consumer-web": CONTEXT_CRITERIA["consumer-web"],
        "enterprise-saas": CONTEXT_CRITERIA["enterprise-saas"],
      },
    },
    is_destructive: {
      type: "noul",
      instructions: "Does completing `task` involve a deleting, irreversible, or financial action?",
      criteria: {
        true: "The task deletes data, cannot be undone, or moves/commits money.",
        false: "The task is read-only, additive, or easily reversible.",
      },
    },
    needs_guidance: {
      type: "noul",
      instructions: "Is the user described by `task` likely unfamiliar with or a novice at it?",
      criteria: {
        true: "The task is something a first-time or occasional user would need help completing.",
        false: "The task is something a trained or repeat user would do without guidance.",
      },
    },
    // Wording chosen by A/B against live jev-1.13.0 (2026-09-19): "does the
    // task require an element none provides" scored 0.59–0.66 on every
    // non-trivial task and could not separate a Kanban board (0.66) from
    // invoice reconciliation (0.59). Asking about the task's CENTRAL element
    // separates cleanly: board 0.93 / dashboard 0.88 / invoices 0.86 versus
    // newsletter 0.10 / delete 0.25 / catalog search 0.35.
    gap: {
      type: "noul",
      instructions:
        "Is the central interface element for `task` — the one thing the user must see or operate to make progress — missing from `available_components`?",
      criteria: {
        true: "The task's central element (for example a board, a data table, a chart, a calendar, a map, a file uploader) is not in `available_components`.",
        false: "The task's central element is one of `available_components`, such as a text field, button, checkbox, label, badge, form field, or search box.",
      },
    },
  };

  // "Should the screen include" rather than "does the task require": jev-1.13
  // reads "require" literally (you can search a catalog without a search box,
  // so ds-search-bar scored 0.42–0.50 on a search task). Asking what a
  // designer would put on the screen is the snap judgment we actually want;
  // A/B on 2026-09-19 moved search-bar to 0.79 on that task and sharpened
  // every other row.
  for (const entry of catalog) {
    const purpose = entry.purpose.replace(/\.$/, "").toLowerCase();
    questions[`${COMPONENT_QUESTION_PREFIX}${entry.name}`] = {
      type: "noul",
      instructions: `Should the screen for \`task\` include a "${entry.name}" (${purpose})?`,
      criteria: {
        true: `A person designing the screen for \`task\` would put a ${purpose} on it.`,
        false: `A ${purpose} would be out of place or unnecessary on the screen for \`task\`.`,
      },
    };
  }

  return questions;
}

export interface AdaptationState {
  task: string;
  current_context: ContextId;
  available_components: CatalogEntry[];
}

/** Small, curated state (jaggedness #5: keep `state` relevant, not a full app dump). */
export function buildState(task: string, currentContext: ContextId, catalog: CatalogEntry[]): AdaptationState {
  return {
    task,
    current_context: currentContext,
    available_components: catalog,
  };
}
