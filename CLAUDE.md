# CLAUDE.md

Agentic design system POC. This file is the context-delivery mechanism for the repo: read it fully before writing code. The specs it references are contracts, not suggestions.

## What this is

A proof of concept for a design system an AI can *be*, not merely read. The system generates, adapts, and evolves Web Components under machine-enforceable constraints, because no human author is guaranteed present at generation time. The differentiator is the enforcement pipeline: if a rule cannot be executed by the validator, it does not exist in this system.

## Spec files (read in this order)

1. `specs/component-definition.schema.json` — the contract every component definition satisfies
2. `specs/constraint-enforcement-spec.md` — the five-stage validation pipeline and validator module contracts
3. `specs/tokens.json` — three-tier token system; its `rules` block is validator configuration, not documentation
4. `specs/success-criteria.md` — falsifiable pass/fail criteria per phase; build to these, not to "works"
5. `specs/ds-button.definition.json` — reference definition proving the schema under a real component

## Non-negotiables

These decisions are settled. Do not soften them, make them configurable, or "improve" them without the human asking.

1. The primitive-tier wall is hardcoded. Any `--prim-*` reference in generated CSS rejects regardless of the constraint's declared failureBehavior. Primitives are also never emitted to runtime CSS; they compile away entirely.
2. AI-authored changes move mutability in the conservative direction only (generative → adaptive → fixed). Loosening requires `provenance.author: human`.
3. The evolution gate has no draw state. A challenger wins by threshold or auto-deprecates at window close. One incumbent per component per context, enforced by a registry invariant.
4. `flag` does not mean pass. Flagged components register as challengers, are excluded from AI composition, and wait for human review.
5. Every AI-authored definition requires `provenance.justification` including at least one rejected alternative. A definition that cannot explain itself does not register.
6. Prose fields in definitions are never read by the validator. If you find yourself parsing a description string to make a decision, stop; the rule belongs in a constraint block or it does not exist.

## Stack

TypeScript throughout. Vanilla Web Components, no framework. Vite for build and dev server. ajv (strict mode) for schema validation. happy-dom for headless rendering in Stage 4. axe-core for accessibility audits. Vitest for tests. No CSS frameworks; all styling flows through the token system.

## Repo structure

```
/specs            The five contract files above. Read-only in spirit; changes go through the human.
/tokens           Token build: parse tokens.json, validate rules block, emit dist/context-*.css
/validator        Pipeline stages 1–5. One module per constraint type, named to match the schema enum.
/generator        Definition → Web Component source. Emits Shadow DOM template, token bindings, behavioral ctx reads.
/registry         Component registry: validation records, structural + API hashes, incumbent invariant.
/telemetry        Four-event interface, synthetic event generator, gate logic.
/components       Generated output. Never hand-edit; regenerate through the pipeline.
/demo             Demo page with data-context switcher and the five-step demo script from success-criteria.md.
/test/adversarial The 8+ deliberately broken definitions from P2. These are the pipeline's proof.
```

## Milestones (target: 3 weeks, tolerances in success-criteria.md)

**M1, days 1–4: Token pipeline.** tokens.json → validated → per-context CSS emission with density calc and primitive compile-away. Exit: P1 criteria green in CI.

**M2, days 5–9: Validator stages 1–3.** Gatekeeping (mutability, structural and API hashing), ajv schema validation, static constraint modules (token-usage, api-stability, mutability, composition-static). Build the adversarial suite alongside, not after. Exit: static portion of P2 green.

**M3, days 10–14: Generator + Stage 4.** Definition-to-component generation, headless rendering, axe-core per context, slot probes, performance measurement. Register ds-button, demo page renders it in both contexts. Upgrade `structuralHash` in validator/hash.ts from the M2 whitespace-normalized string hash to a real template-AST hash now that the generator emits templates (decision recorded 2026-07-11). Exit: P2 fully green, P4 partially (button only).

**M4, days 15–17: Component set.** Remaining atoms and molecules: Text Input, Label, Checkbox, Badge, Form Field, Search Bar. Form Field must demonstrate behavioral ctx tokens (validation-mode). First step: delete the M2 composition-stub registrations for ds-form-field and ds-search-bar (`registerCompositionStubs` in test/helpers.ts) so tests referencing them fail until the real components register — the stubs were name reservations, not implementations (decision recorded 2026-07-11). Exit: P4 green.

**M5, days 18–21: Generation flow + evolution.** Structured-form requirement input → AI-generated definition → pipeline → registration, with justification. Synthetic telemetry, gate logic, promotion and auto-deprecation. Exit: P3 and P5 green, demo script runs end to end.

Sequencing rule: the validator exists before the generator. The system that says no is built before the system that creates, or the constraints will be shaped to fit the output instead of the other way around.

## Known cleanup

`type-caption` in tokens.json uses string shorthand for a composite typography token while its siblings use object form. Normalize all composite tokens to object form in the token parser and update the file. Do this in M1.

## Working agreement

Put before/after screenshots in every PR that touches rendered output. Draft PRs by default. When you make a design call the specs do not cover, make it, then state the call and the rejected alternative in the PR description. Matching the specs is required; matching them silently is not the goal.
