# P3 corpus results

Ten structured requirements (`test/generation/requirements/req-01.json` …
`req-10.json`), each with one recorded good-faith AI-authored attempt
(`test/generation/attempts/attempt-01.definition.json` … `attempt-10.json`),
run through the real pipeline (`validator/pipeline.ts`) via the generic
css+source fallback synthesis (`generation/synthesize.ts`, documented in that
file's header). One round. No attempt was edited after seeing its result —
this file records the pipeline's own output, unmodified.

**Round 1 result: 7 / 10 registered.** Within the 3-of-10 failure budget
(success-criteria.md P3); no second round was needed.

| req | component | attempt | outcome | stage | detail |
|---|---|---|---|---|---|
| req-01 | ds-tag | attempt-01 | **registered** | 5 | token wall, contrast, api-stability all pass |
| req-02 | ds-toggle-switch | attempt-02 | **registered** | 5 | token wall, contrast, api-stability all pass |
| req-03 | ds-alert | attempt-03 | **registered** | 5 | token wall, contrast, api-stability all pass |
| req-04 | ds-avatar | attempt-04 | **registered** | 5 | token wall, contrast, api-stability all pass |
| req-05 | ds-tooltip | attempt-05 | **REJECTED** | 2 (stage2-schema) | `tokens.consumes[5]` = `--prim-color-gray-900` fails the schema pattern `^--(sem\|ctx)-[a-z0-9-]+$`. The attempt's own justification names this as a deliberate, flagged risk: no sem-tier "inverted/dark surface" token exists in `tokens.json`, so the attempt reached for a primitive directly rather than silently faking a workaround. Real, load-bearing failure — the primitive wall did its job. |
| req-06 | ds-progress-bar | attempt-06 | **registered** | 5 | token wall, contrast, api-stability all pass |
| req-07 | ds-radio-group | attempt-07 | **REJECTED** | 4 (stage4-accessibility) | Declared the `label` a11y rule (a radio group needs a group-level accessible name), but the generic fallback source synthesizer (`generation/synthesize.ts`) does mechanical attribute reflection only — it never wires a `label` *property* to an `aria-label` *attribute* on the host. The attempt's justification is explicit that it expects this gap: "if the generic fallback used for validation can't satisfy that rule, that is a real gap to surface, not one to quietly drop." Rejection message: `<ds-radio-group> has no accessible label: no aria-label or aria-labelledby.` A real archetype for ds-radio-group would fix this trivially; the generic fallback correctly can't. |
| req-08 | ds-divider | attempt-08 | **registered** | 5 | token wall, focus-order-semantics, api-stability all pass (contrast intentionally not declared — no contrastPair on the consumed border token) |
| req-09 | ds-stepper | attempt-09 | **REJECTED** | 3 (stage3-constraints) | `composition.allowedChildren` names `ds-step-item`, which this submission never registers. The composition module's closed-world check (`validator/modules/composition.ts`) rejects any reference to an unregistered component. The attempt's justification names this exact tradeoff up front: child components must register before the parent that names them, and no separate ds-step-item registration was included in this corpus. |
| req-10 | ds-rating | attempt-10 | **registered** | 5 | token wall, contrast, api-stability all pass |

## What the 3 failures demonstrate

Each failure exercises a different stage of the pipeline, which is the point
of a 3-of-10 budget rather than 0-of-10 or 10-of-10:

- **req-05 (Stage 2, schema):** the primitive-tier wall catches a plausible
  mistake — reaching for a raw primitive when no semantic token covers the
  need — before the definition even reaches constraint dispatch.
- **req-07 (Stage 4, rendered):** an accessibility rule that is honestly
  *intended* by the definition's author but not actually *satisfiable* by
  the generic fallback synthesis used for novel, archetype-less components.
  This is the sharpest illustration of `generation/synthesize.ts`'s
  documented limitation: it is deliberately "dumb" so that a definition
  which depends on archetype-specific wiring fails for real, rather than
  passing because the fallback quietly did more than it claims to.
- **req-09 (Stage 3, static constraints):** the composition allowlist's
  closed-world check rejects a reference to a component that was never
  registered in this run — a genuine cross-definition dependency the corpus
  doesn't resolve, not a malformed definition.

## Design call: generic fallback needed BOTH css and source, not css alone

CLAUDE.md's M5 brief describes the P3 fallback as `{ definition, css:
synthesizeCss(def) }` (definition + css only). Taken literally, that is
unsatisfiable for any attempt that declares an `accessibility` constraint:
`validator/stage4-rendered.ts`'s existing rule is that an accessibility
constraint with no generated *source* artifact (`candidate.source`, not
`candidate.css`) is itself an unconditional Stage 4 rejection — a css-only
candidate never has `candidate.source` set, so every accessibility-bearing
attempt would reject at Stage 4 regardless of its actual design, which would
make the corpus's pass rate meaningless (it would test "did you attach a
source artifact," not "is this component well-designed"). `generation/synthesize.ts`
therefore also exports `synthesizeSource`, a generic mechanical Web Component
(shadow DOM, css from `synthesizeCss`, attribute↔property reflection, slot
probing) — same shape every hand-authored archetype in `generator/archetypes/`
already produces, with zero component-specific behavior. This is what lets
req-07's failure be a *real* signal (the fallback can render something, it
just can't satisfy every a11y rule) instead of a structural non-starter.
