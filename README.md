# agentic-ds

A proof of concept for a design system an AI can *be*, not merely read.

The system generates, adapts, and evolves Web Components under machine-enforceable constraints, because no human author is guaranteed present at generation time. The differentiator is the enforcement pipeline: **if a rule cannot be executed by the validator, it does not exist in this system.**

## What this is, in plain terms

A design system is the shared set of building blocks a company uses for its screens — the standard button, the standard form field, the approved colors and spacing — so everything looks and behaves consistently. Normally that consistency depends on people: designers write the guidelines, developers follow them, and reviewers catch the mistakes.

This project is an experiment for a different situation: an AI is writing the UI, and there may be no person reviewing its work. So instead of writing the guidelines as documentation and hoping they get followed, the guidelines here are automated checks. A component that breaks a rule doesn't get a comment in code review — it gets rejected by the build, with an error saying which rule it broke and where.

In practice that means:

- **Components never contain hardcoded colors, sizes, or fonts.** They refer to named choices like "the action color" or "the standard control padding," and the actual values come from a settings file. Change the settings, and every component updates — which is also how the same button can look casual and spacious in a consumer app but compact and businesslike in an enterprise tool, without two versions of the button existing.
- **Every component is checked before it can be used.** Is it built correctly? Does it only use the approved colors and spacing? Is the text readable? Does it work with a keyboard? Any failure blocks the component entirely and produces a specific error message.
- **Component code is generated from a written spec**, the same way every time, rather than typed by hand.
- **Competing versions are settled by data.** If someone (or some AI) proposes a new version of a component, it only replaces the current one by measurably performing better with users — fewer errors, faster interactions. If it doesn't clear that bar within a set time window, it's automatically retired. Alternatives can't quietly pile up.

**Why this matters:** teams everywhere are starting to let AI write their user interfaces. The open question is what stops it from producing inconsistent, inaccessible, or broken screens. Today the answers are "a human reviews everything" (too slow to keep up) or "we told the AI the rules in its instructions" (nothing guarantees it listens). This project demonstrates a third option: rules that are enforced by software, so they hold no matter what the AI produces.

**Did it work?** In testing, the AI wrote ten component specs doing its honest best — and the checks rejected three of them, each with a specific, legitimate reason (one tried to use a raw color value because no approved color fit its need). That's the meaningful result: checks that never reject anything aren't checks. Meanwhile, one codebase served both the consumer and enterprise looks with zero duplicated component code, and the version-replacement process promoted a measurably better variant and retired a worse one, automatically. People wrote the rules; the software enforces them. That division of labor is the whole idea.

## Status

| Milestone | Scope | Status |
|---|---|---|
| M1 | Token pipeline (parse → validate → per-context CSS) | ✅ P1 criteria green |
| M2 | Validator stages 1–3 + adversarial suite | ✅ static portion of P2 green |
| M3 | Generator + rendered verification (Stage 4) | ✅ P2 fully green, P4 partial (button) |
| M4 | Component set (7 components, both contexts) | ✅ P4 green |
| M5 | Generation flow + evolution gate | ✅ P3 (7/10 corpus attempts register) + P5 (gate promote/auto-deprecate/invariant) green |

## Quick start

```sh
npm install
npm run build:tokens      # specs/tokens.json → tokens/dist/context-*.css
npm run build:components  # definitions → /components (7 real components)
npm run build:demo-data   # real pipeline records → demo/demo-data.json (M5 demo steps 2-3)
npm test                  # all tests, P1 through P5
npm run dev                # then open http://localhost:5173/demo/index.html
```

The demo page renders token-styled elements and a context toggle. Flipping `data-context` on `<html>` between `consumer-web` and `enterprise-saas` re-skins, re-densifies, and changes behavioral token values with zero component code — every visual difference flows through CSS custom properties emitted per context.

## Demo script (five steps, success-criteria.md)

1. **Context flip.** Toggle `data-context` at the top of the page; every component re-skins, re-densifies, and changes validation behavior with zero component code paths branching on context.
2. **Generate a component.** Pick one of ten recorded structured requirements, click Generate. The recorded AI-authored definition's real pipeline record (from `npm run build:demo-data`) is replayed: on pass, its justification and a token-styled live preview render; on fail, the exact rejecting stage/constraint/source-span renders instead.
3. **Poison the pipeline.** Submit a definition whose CSS references a primitive token. Watch it die with the real validation record naming `--prim-color-blue-500` by source span.
4. **Run the gate.** Live in the browser: seeded synthetic telemetry for ds-button's `standard` vs. `compact-affordance` variants feeds `telemetry/gate.ts`. A winning seed promotes (re-running Stages 2-4 via a precomputed real revalidation record before the registry flips); a losing seed auto-deprecates once the window closes. The status board shows one incumbent per context throughout.

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
/validator         Pipeline stages 1–4: gatekeeping, ajv schema validation, constraint modules
                   (token-usage, api-stability, mutability, composition), rendered verification
                   (contrast from token data, a11y probes, slot probes, perf budgets).
/generator         Deterministic definition → Web Component source. Archetype-based; no LLM.
/definitions       AI-authored component definitions (label, badge, text-input, checkbox,
                   form-field, search-bar), each carrying a provenance justification with
                   at least one rejected alternative. ds-button's stays in /specs.
/components        Generated output. Never hand-edit; regenerate via npm run build:components.
/registry          Component registry: validation records, structural + API hashes,
                   one-incumbent-per-context invariant enforced on every write.
/test/adversarial  11 deliberately broken definitions, each violating exactly one constraint.
                   The pipeline's proof: every one dies with a record naming the violation.
/telemetry         Four-event interface, seeded synthetic event generator, gate logic
                   (browser-safe, zero node imports), and the registry promotion/deprecation
                   transaction. Node-side pipeline revalidation wiring lives in telemetry/node.ts.
/generation        Structured-requirement → AI-authored definition flow (the corpus-lookup seam
                   `generateDefinition`) and the generic css/source fallback synthesis used to
                   validate novel, archetype-less components (generation/synthesize.ts).
/test/generation   Ten structured requirements + ten recorded good-faith attempts (P3 corpus),
                   run once through the real pipeline. results.md records the honest outcome.
/demo              Demo page: context switcher (M1) plus the M5 generate/poison/gate-simulation
                   steps, backed by demo/build-demo-data.ts's real pipeline records.
```

The sequencing rule: the validator exists before the generator. The system that says no is built before the system that creates.

## Specs (read in this order)

1. [component-definition.schema.json](specs/component-definition.schema.json) — the contract every component definition satisfies
2. [constraint-enforcement-spec.md](specs/constraint-enforcement-spec.md) — the five-stage validation pipeline
3. [tokens.json](specs/tokens.json) — the three-tier token system and its rules block
4. [success-criteria.md](specs/success-criteria.md) — falsifiable pass/fail criteria per phase
5. [ds-button.definition.json](specs/ds-button.definition.json) — reference definition proving the schema

## Stack

TypeScript throughout. Vanilla Web Components (from M3), no framework. Vite, Vitest, happy-dom, ajv (strict mode), axe-core. No CSS frameworks; all styling flows through the token system.
