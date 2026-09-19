// Live backend: node-only (server side, per CLAUDE.md M6). Never imported
// by demo/demo.ts or anything else that ships to the browser — the API key
// stays server-side (see vite.config.ts's /api/adapt middleware) and this
// module is only reachable from there or from adaptation/record.ts.

import { TypeSafeClient } from "@typesafe-ai/sdk";
import { ADAPTATION_MODEL, buildQuestions, buildState, COMPONENT_QUESTION_PREFIX, type CatalogEntry } from "../contract.js";
import type { AdaptationDecider, AdaptationDeciderInput, ModedDecider, RawAnswers } from "../decider.js";
import type { ContextId } from "../contract.js";

export class AdaptationUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AdaptationUnavailableError";
  }
}

function toRawAnswers(answers: Record<string, unknown>, catalog: CatalogEntry[]): RawAnswers {
  const contextAnswer = answers.context as { choice: string; probabilities: Record<string, number>; confidence: number };
  const components: Record<string, number> = {};
  for (const entry of catalog) {
    const key = `${COMPONENT_QUESTION_PREFIX}${entry.name}`;
    const answer = answers[key] as { noul: number } | undefined;
    components[entry.name] = answer?.noul ?? 0;
  }
  const noul = (key: string): number => (answers[key] as { noul: number } | undefined)?.noul ?? 0;

  return {
    context: {
      choice: contextAnswer.choice as ContextId,
      probabilities: contextAnswer.probabilities,
      confidence: contextAnswer.confidence,
    },
    components,
    is_destructive: noul("is_destructive"),
    needs_guidance: noul("needs_guidance"),
    gap: noul("gap"),
  };
}

/** Wraps @typesafe-ai/sdk's TypeSafeClient behind the AdaptationDecider seam. Reads TYPESAFE_API_KEY via the SDK's own env fallback. */
export class TypeSafeAdaptationDecider implements AdaptationDecider, ModedDecider {
  readonly mode = "live" as const;
  private readonly client: TypeSafeClient;

  constructor(client?: TypeSafeClient) {
    this.client = client ?? new TypeSafeClient();
  }

  async decide(input: AdaptationDeciderInput): Promise<RawAnswers> {
    const questions = buildQuestions(input.catalog);
    const state = buildState(input.task, input.currentContext, input.catalog);
    try {
      const result = await this.client.systemOne({
        state,
        model: ADAPTATION_MODEL,
        // The SDK types Questions with its own Noul/Choice/Score helper types;
        // our contract builds the same wire shape as plain JSON per api.md, so
        // we hand it across the seam rather than re-authoring every question
        // with the SDK's `choice()`/`noul()` helpers.
        questions: questions as never,
      });
      return toRawAnswers(result.answers as unknown as Record<string, unknown>, input.catalog);
    } catch (error) {
      throw new AdaptationUnavailableError(
        `TypeSafe adaptation call failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
    }
  }
}
