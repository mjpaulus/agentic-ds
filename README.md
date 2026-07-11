# agentic-ds

A proof of concept for a design system an AI can *be*, not merely read.

The system generates, adapts, and evolves Web Components under machine-enforceable constraints, because no human author is guaranteed present at generation time. The differentiator is the enforcement pipeline: **if a rule cannot be executed by the validator, it does not exist in this system.**

## Status

| Milestone | Scope | Status |
|---|---|---|
| M1 | Token pipeline (parse → validate → per-context CSS) | ✅ P1 criteria green |
| M2 | Validator stages 1–3 + adversarial suite | ✅ static portion of P2 green |
| M3 | Generator + rendered verification (Stage 4) | not started |
| M4 | Component set (7 components, both contexts) | not started |
| M5 | Generation flow + evolution gate | not started |

## Quick start

```sh
npm install
npm run build:tokens   # specs/tokens.json → tokens/dist/context-*.css
npm test               # all tests, including the P1 criteria
npx vite               # then open http://localhost:5173/demo/
```

The demo page renders token-styled elements and a context toggle. Flipping `data-context` on `<html>` between `consumer-web` and `enterprise-saas` re-skins, re-densifies, and changes behavioral token values with zero component code — every visual difference flows through CSS custom properties emitted per context.

## How the token pipeline works

`specs/tokens.json` defines three tiers. Its `rules` block is validator **configuration**, not documentation — the build reads it and enforces it.

- **prim** — raw values. Build-time only: compiled away entirely, never emitted as custom properties. A `var(--prim-*)` reference in CSS resolves to nothing even if it evades validation. The wall is physical, not procedural.
- **sem** — meaning-bearing aliases (`--sem-color-action-bg`, `--sem-space-inset-control`). The only color/space/type surface components may touch. Per-context resolutions must be complete: a sem token missing a resolution for any declared context fails the build, naming the token and the missing context.
- **ctx** — per-context knobs (`--ctx-density-scale`, `--ctx-motion-duration`) including behavioral tokens (`--ctx-validation-mode`, `--ctx-disclosure-mode`) that change component *behavior*, not just style.

Emission produces one block per context: `:root[data-context='<name>'] { --sem-*, --ctx-* }`. Dimension tokens flagged `densityScaled: true` emit as `calc(<value> * var(--ctx-density-scale))`, so density is a single knob per context.

## P1 success criteria (all enforced as tests)

1. Deleting one context resolution from any sem token fails the build with an error naming the token and the missing context.
2. `grep -r -- "--prim" tokens/dist/` returns zero matches in emitted CSS.
3. Both context blocks emit, and a page flips between them via the `data-context` attribute with no component code involved.

See [specs/success-criteria.md](specs/success-criteria.md) for the falsifiable criteria across all five phases.

## Repo structure

```
/specs             The five contract files. Read these first; they are contracts, not references.
/tokens            Token build: parser, rules-block validator, CSS emitter, P1 tests.
/validator         Pipeline stages 1–3: gatekeeping, ajv schema validation, constraint modules
                   (token-usage, api-stability, mutability, composition). Stage 4 lands in M3.
/registry          Component registry: validation records, structural + API hashes,
                   one-incumbent-per-context invariant enforced on every write.
/test/adversarial  11 deliberately broken definitions, each violating exactly one constraint.
                   The pipeline's proof: every one dies with a record naming the violation.
/demo              Demo page with the data-context switcher.
```

Later milestones add `/generator`, `/telemetry`, and `/components` — in that order. The sequencing rule: the validator exists before the generator. The system that says no is built before the system that creates.

## Specs (read in this order)

1. [component-definition.schema.json](specs/component-definition.schema.json) — the contract every component definition satisfies
2. [constraint-enforcement-spec.md](specs/constraint-enforcement-spec.md) — the five-stage validation pipeline
3. [tokens.json](specs/tokens.json) — the three-tier token system and its rules block
4. [success-criteria.md](specs/success-criteria.md) — falsifiable pass/fail criteria per phase
5. [ds-button.definition.json](specs/ds-button.definition.json) — reference definition proving the schema

## Stack

TypeScript throughout. Vanilla Web Components (from M3), no framework. Vite, Vitest, happy-dom, ajv (strict mode), axe-core. No CSS frameworks; all styling flows through the token system.
