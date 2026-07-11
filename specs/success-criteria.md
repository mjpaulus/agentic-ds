# POC Success Criteria

v1.0 · Every criterion below is falsifiable. If a criterion cannot fail, it is not a criterion. "Compiles" and "looks right" appear nowhere in this document.

## Phase criteria

**P1: Token pipeline.** The build parses `tokens.json`, validates it against its own rules block, and emits per-context CSS. Pass requires all three: (a) deleting one context resolution from any sem token fails the build with an error naming the token and the missing context, (b) `grep -r "\-\-prim" dist/` returns zero matches in emitted CSS, (c) both context blocks emit and a test page flips between them via the `data-context` attribute with no component code involved.

**P2: Enforcement pipeline.** The validator rejects what it should and passes what it should. Pass requires an adversarial test suite of at least 8 deliberately broken definitions, each violating exactly one constraint (a primitive token reference, a contrast failure in one context only, an API signature drift on an adaptive component, a mutation request against a fixed component, an unregistered child in allowedChildren, a missing justification on an AI-authored definition, an unknown constraint type, a slot content violation). Every one is rejected with a validation record naming the failing constraint id and source span. The known-good `ds-button` definition registers cleanly. Zero false positives, zero false negatives, in CI.

**P3: Generation.** Given a structured-form requirement input, the AI produces a component definition that passes the full pipeline without human edits in at least 7 of 10 attempts, and every AI-authored definition carries a populated `provenance.justification` that states at least one rejected alternative. The 3-of-10 failure budget is deliberate: a pipeline that never rejects AI output is not enforcing anything, it is decorating it.

**P4: Adaptation.** All seven components (Button, Text Input, Label, Checkbox, Badge, Form Field, Search Bar) register once and render correctly in both contexts. Pass requires: (a) zero per-context component code, all variation flows through token bindings and behavioral ctx tokens, (b) axe-core passes at WCAG 2.1 AA in both contexts independently, (c) `validation-mode` demonstrably changes Form Field behavior (blur validation in enterprise, submit validation in consumer) with the difference driven only by the ctx token.

**P5: Evolution.** Synthetic telemetry drives the gate end to end. Pass requires: (a) a challenger that beats the incumbent by the threshold promotes, and promotion re-runs the full pipeline before the registry flips, (b) a challenger that misses the threshold auto-deprecates when the window closes, (c) at no point does the registry hold two incumbents for the same component and context, asserted by an invariant test that runs on every registry write.

## The demo script

The POC succeeds when this five-minute sequence runs live without apology:

1. Open the demo page. Flip `data-context` between consumer-web and enterprise-saas. Every component re-skins, re-densifies, and changes validation behavior. No reload, no component code paths.
2. Submit a requirement through the structured form. The AI generates a definition, the pipeline validates it, the component registers and renders. Read its justification aloud.
3. Submit a poisoned definition that references a primitive token. Watch it die, and show the validation record naming the exact violation.
4. Run the gate simulation. Watch a challenger win and promote, then watch a second challenger fail and auto-deprecate.
5. Ask the room: which part of this required a human to be present? The answer for steps 1 through 4 is none, and the answer for what a human authored is the constraints themselves. That asymmetry is the thesis.

## What failure looks like

Worth naming so nobody rationalizes it later: the POC has failed if the pipeline passes everything the AI generates (the constraints are decorative), if context adaptation requires component-level branching (the token architecture leaked), or if variant count grows without the gate killing anything (the cost function is fiction).
