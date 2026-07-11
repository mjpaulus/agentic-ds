// Types for the tokens.json structure. Only structured fields (rules.contexts,
// rules.tiers) are ever read for validation logic; prose fields (note,
// completeness, emission, contrast, $description) are never parsed. See
// CLAUDE.md rule #6.

export type TierName = "prim" | "sem" | "ctx";

export type TokenType =
  | "color"
  | "dimension"
  | "fontFamily"
  | "fontWeight"
  | "number"
  | "duration"
  | "string"
  | "typography";

/** A raw {curly.path} reference string, e.g. "{prim.color.blue.600}". */
export type TokenReference = string;

/** Composite typography value in object form. Each field is a reference string. */
export interface TypographyComposite {
  family: TokenReference;
  size: TokenReference;
  weight: TokenReference;
  lineHeight: TokenReference;
}

/**
 * Per-context resolution map. Values are either simple reference strings, or
 * (for typography tokens) composite objects.
 */
export type PerContextResolution<TValue = TokenReference | TypographyComposite> = Record<
  string,
  TValue
>;

/** A leaf's `resolution` field: either a single reference/object, or a per-context map. */
export type Resolution =
  | TokenReference
  | TypographyComposite
  | PerContextResolution;

export interface ExtensionsBlock {
  "ds.contrastPair"?: string;
  [key: string]: unknown;
}

/** A primitive-tier leaf: literal value only, never a reference. */
export interface PrimLeaf {
  $type: TokenType;
  $value: string | number;
  [key: string]: unknown;
}

/** A sem/ctx-tier leaf. May have a literal $value (ctx) or a resolution (sem/ctx). */
export interface SemOrCtxLeaf {
  $type: TokenType;
  $value?: string | number;
  resolution?: Resolution;
  densityScaled?: boolean;
  behavioral?: boolean;
  $extensions?: ExtensionsBlock;
  [key: string]: unknown;
}

/** Recursive tree of primitive tokens, grouped by category (color, space, ...). */
export interface PrimTree {
  [category: string]: PrimTree | PrimLeaf;
}

export type SemTree = Record<string, SemOrCtxLeaf>;

/** ctx tree: one sub-object per context name, each holding named leaves. */
export type CtxTree = Record<string, Record<string, SemOrCtxLeaf>>;

export interface TierRule {
  mayReference: TierName[];
  componentAccessible: boolean;
  emitToCss: boolean;
  /** Prose. Never parsed for logic. */
  note?: string;
}

export interface RulesBlock {
  contexts: string[];
  tiers: Record<TierName, TierRule>;
  /** Prose fields below. Never parsed for logic (CLAUDE.md rule #6). */
  completeness?: string;
  emission?: string;
  contrast?: string;
}

export interface TokensFile {
  $description?: string;
  version: string;
  rules: RulesBlock;
  prim: PrimTree;
  sem: SemTree;
  ctx: CtxTree;
}

/** A resolved ds.contrastPair entry, per context. */
export interface ResolvedContrastPair {
  token: string;
  pairedToken: string;
  context: string;
  tokenValue: string;
  pairedTokenValue: string;
}
