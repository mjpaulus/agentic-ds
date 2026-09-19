// Fixture backend (CLAUDE.md M6). Loads adaptation/fixtures/recorded-answers.json,
// keyed by normalized task text. Browser-safe: no node imports — the fixture
// JSON is passed in already-parsed (the /api/adapt middleware reads it via
// node:fs server-side; the demo page never fetches this file directly).

import type { AdaptationDeciderInput, AdaptationDecider, ModedDecider, RawAnswers } from "../decider.js";
import type { CatalogEntry, ContextId } from "../contract.js";

export interface FixtureEntry {
  provenance: string;
  context: { choice: ContextId; probabilities: Record<string, number>; confidence: number };
  components: Record<string, number>;
  is_destructive: number;
  needs_guidance: number;
  gap: number;
}

export interface FixtureFile {
  provenance: string;
  model?: string | null;
  note?: string;
  fixtures: Record<string, FixtureEntry>;
}

export function normalizeTask(task: string): string {
  return task.trim().toLowerCase().replace(/\s+/g, " ");
}

function keywordOverlap(a: string, b: string): number {
  const wordsA = new Set(a.split(/\W+/).filter(Boolean));
  const wordsB = new Set(b.split(/\W+/).filter(Boolean));
  let overlap = 0;
  for (const w of wordsA) if (wordsB.has(w)) overlap++;
  return overlap;
}

/**
 * Unknown task -> nearest fixture by simple keyword overlap (word-set
 * intersection size against every fixture key), or a neutral "keep
 * everything" answer set if NOTHING overlaps at all (zero shared words):
 * choice = currentContext at low confidence (forces 'keep' via the
 * hysteresis rule in resolveAdaptation, since choice === current), no
 * component clears componentRelevant, and destructive/guidance/gap all
 * read as unlikely. This is the documented fallback — a genuinely novel
 * task should not be forced into whichever fixture happens to be first.
 */
function neutralAnswers(currentContext: ContextId, catalog: CatalogEntry[]): RawAnswers {
  const components: Record<string, number> = {};
  for (const entry of catalog) components[entry.name] = 0.1;
  return {
    context: { choice: currentContext, probabilities: { [currentContext]: 1 }, confidence: 0.3 },
    components,
    is_destructive: 0.05,
    needs_guidance: 0.3,
    gap: 0.1,
  };
}

export class RecordedAdaptationDecider implements AdaptationDecider, ModedDecider {
  readonly mode = "recorded" as const;

  constructor(private readonly file: FixtureFile) {}

  get provenance(): string {
    return this.file.provenance;
  }

  async decide(input: AdaptationDeciderInput): Promise<RawAnswers> {
    const key = normalizeTask(input.task);
    const exact = this.file.fixtures[key];
    const fixture = exact ?? this.nearest(key);
    if (!fixture) return neutralAnswers(input.currentContext, input.catalog);

    const components: Record<string, number> = {};
    for (const entry of input.catalog) {
      components[entry.name] = fixture.components[entry.name] ?? 0.1;
    }
    return {
      context: fixture.context,
      components,
      is_destructive: fixture.is_destructive,
      needs_guidance: fixture.needs_guidance,
      gap: fixture.gap,
    };
  }

  private nearest(key: string): FixtureEntry | undefined {
    let best: { entry: FixtureEntry; score: number } | undefined;
    for (const [fixtureKey, entry] of Object.entries(this.file.fixtures)) {
      const score = keywordOverlap(key, fixtureKey);
      if (score > 0 && (!best || score > best.score)) best = { entry, score };
    }
    return best?.entry;
  }
}
