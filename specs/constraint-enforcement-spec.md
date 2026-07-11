# Constraint Enforcement Specification

v1.0 · Companion to `component-definition.schema.json` v2.0.0

## Position

This document defines the difference between a design system an AI can read and one an AI can be. In a human-authored system, constraints live in documentation and review culture. Here, no human is guaranteed to be present when a component is generated, adapted, or evolved. Every constraint must therefore be expressible as code, executable without judgment, and binding without exception. If a rule cannot be enforced by the pipeline below, it does not exist in this system.

## Scope for the POC

Enforcement runs at generation time: every component definition and every generated implementation passes the full pipeline before it can register as a custom element. Runtime enforcement (live token auditing, per-render constraint checks, telemetry-driven adaptation in production) is out of scope for the POC and documented as a seam in Section 7. This is a deliberate cut. The pipeline architecture is identical in both cases; only the trigger differs.

## 1. Pipeline Overview

Every candidate (a new definition, a regeneration request, or a challenger variant) passes five stages in order. A rejection at any stage halts the pipeline and emits a validation record. Nothing registers without a passing record.

1. **Gatekeeping.** Mutability and identity checks. Cheapest checks first.
2. **Schema validation.** The definition validates against `component-definition.schema.json` via ajv in strict mode.
3. **Constraint validation.** Each entry in the definition's `constraints` array dispatches to its matching validator module. Modules are enumerated in Section 3. An unknown constraint type is itself a rejection.
4. **Rendered verification.** The generated Web Component is instantiated in a headless DOM (happy-dom or jsdom) per declared context, and checks that require a live tree run here: axe-core accessibility audit, computed token resolution, composition probes.
5. **Registration.** A passing candidate is written to the registry with its validation record, structural hash, API signature hash, and provenance attached. The record is the component's passport; generation tooling refuses to compose with unregistered components.

## 2. Stage 1: Gatekeeping Rules

**Fixed components.** Any regeneration or mutation request targeting a definition with `mutability: fixed` is rejected before parsing the payload. The only path to changing a fixed component is a human-authored definition with a version bump and `provenance.author: human`. This is not a review step; it is a locked door.

**Adaptive components.** A candidate claiming to update an adaptive component must produce a structural hash (canonical hash of the template AST) and an API signature hash (canonical hash of the `api` object) identical to the registry entry. Only token bindings may differ, and only bindings to context-tier tokens. Structural drift of any size is a rejection.

**Generative components.** Pass through to the full pipeline. Their freedom is downstream, not here: identity rules still apply (a generative candidate cannot claim the name of an existing component without declaring `evolution.supersedes`).

## 3. Stage 3: Validator Modules

Each constraint type in the schema maps to exactly one module. Rule shapes below are the contract Claude Code implements.

### token-usage

Rule shape: `{ "allowedTiers": ["sem", "ctx"], "consumesOnly": true }`

The module parses the component's generated CSS (inside the Shadow DOM template) and extracts every `var()` reference. Three checks: every reference matches the tier prefix allowlist (`--sem-*` or `--ctx-*`; any `--prim-*` reference is a rejection regardless of failureBehavior, this one is not configurable), every reference appears in `tokens.consumes`, and no raw values exist where a token category applies (a hex color literal in generated CSS is a rejection; a `border-radius` literal is a flag). The primitive-tier wall is the mechanism that makes the three-tier token structure real rather than aspirational.

### accessibility

Rule shape: `{ "standard": "wcag21aa", "rules": ["color-contrast", "button-name", "label", "focus-order-semantics"], "contexts": ["consumer-web", "enterprise-saas"] }`

Runs in Stage 4 against the rendered instance, once per declared context (token resolution differs per context, so contrast can pass in one and fail in another; both must pass). axe-core violations at `serious` or `critical` map to reject; `moderate` maps to flag. Additionally, keyboard operability is probed directly: every interactive element must be reachable and operable via synthetic keyboard events.

### composition

Rule shape: the `composition` object from the definition, plus `{ "enforceSlotContent": true }`

Static check: the definition's `allowedChildren` and `allowedParents` must be closed under the registry (referencing an unregistered component is a rejection). Rendered check: slot content probes insert allowed and disallowed elements; the component must render allowed content and must not silently accept disallowed content. For the POC, disallowed slot content triggers a console error from the component's own connectedCallback; the validator asserts that error fires.

### mutability

Rule shape: `{ "class": "fixed" | "adaptive" | "generative" }`

Mostly enforced at Stage 1, but this module re-asserts inside the pipeline so that a definition cannot downgrade its own mutability class. A mutation from `fixed` to anything, or `adaptive` to `generative`, requires `provenance.author: human`. AI-authored candidates may move components in the conservative direction only (generative to adaptive, adaptive to fixed).

### performance

Rule shape: the `performanceBudget` object.

Rendered instance is measured in the headless environment: time from upgrade to first render, and synthetic interaction latency. Bundle size is measured on the generated module. Budget breach maps to flag by default (headless numbers are directional, not gospel) unless the definition sets reject.

### api-stability

Rule shape: `{ "signatureHash": "<registry value>" }`

For adaptive and fixed components, recomputes the API signature hash and compares against the registry. Also validates that any generated *usage* of a component (composition inside molecules and organisms) passes property values that satisfy each property's type and `enum`. This is where "Claude can only pass `variant: primary | secondary | danger`" gets teeth.

## 4. Failure Semantics

`reject`: the candidate never registers, the validation record captures the failing constraint id, module output, and the offending source span. The generating agent receives the record and may retry; retries are new candidates with new records, there is no negotiation channel.

`flag`: the candidate registers as `status: challenger` regardless of what it requested, carries a warning record, and enters the human review queue. Flagged components are excluded from AI composition until a human clears the flag. This preserves velocity without letting warnings launder themselves into production defaults.

The default posture is reject. Flag is opt-in per constraint and requires a rationale string, which the review queue displays. If the rationale is empty, the pipeline treats the constraint as reject.

## 5. The Evolution Gate

The gate is the anti-bloat mechanism. A generative component or challenger variant does not ship because it validates; validation is table stakes. It ships because it wins.

Gate logic, implemented for real even though POC telemetry is synthetic: a challenger accumulates events against its `evolution.gate.metric` until `minSamples` is reached within `windowDays`. If the challenger's metric beats the incumbent's by at least `threshold`, the challenger is promoted to incumbent and the former incumbent moves to deprecated. If the window closes without a win, the challenger auto-deprecates. No draw state, no indefinite coexistence, no forty button variants each locally justified. One incumbent per component per context, always.

Promotion is itself a pipeline event: the promoted definition re-runs Stages 2 through 4 before the registry flips, because a challenger validated three weeks ago validates against three-week-old tokens.

## 6. Telemetry Event Spec (gate inputs)

Four events, deliberately minimal for the POC. Each event carries `{ componentName, variantName, context, sessionId, timestamp }` plus the fields below.

`component-interaction`: `{ interactionType, targetProperty }`. Fired on user interaction with the component.
`component-error`: `{ errorClass, recovered }`. Fired on validation errors, failed interactions, and rejected input.
`task-completion`: `{ taskId, durationMs, completed }`. Fired by the host page when a flow containing the component resolves.
`component-abandonment`: `{ dwellMs }`. Fired when a user interacts with a component and exits the flow without completion.

Gate metrics derive from these: task-completion-rate and abandonment-rate from the last two, interaction-error-rate from the first two, time-to-interaction from render timestamps already in the performance module. The POC ships a synthetic event generator that produces plausible distributions per variant so the gate logic is exercised end to end before real telemetry exists.

## 7. The Runtime Seam

Deferred, with interfaces held open:

Runtime token auditing (a MutationObserver-based auditor that catches style injection bypassing the token wall) shares the token-usage module's parser; the module exports it. Live adaptation (context switching per user, per session) is already structurally supported because adaptive components vary only by context-tier token bindings; the runtime just swaps the binding source. Production telemetry replaces the synthetic generator behind the same four-event interface. Nothing in the pipeline assumes its trigger is a build step.

## 8. What This Buys

Astryx makes a design system legible to AI and keeps humans as the enforcement layer. This spec removes the human from the enforcement layer without removing the human from the system: people author fixed components, review flags, and set thresholds. The machine holds the walls. That is the difference this POC exists to demonstrate.
