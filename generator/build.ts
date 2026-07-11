// Build entry: definition -> /components/*.js|.template.html|.css.
// npm script: build:components. Never hand-edit /components — only this
// pipeline writes there (CLAUDE.md hard rule).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ComponentDefinition } from "../validator/types.js";
import { generateComponent } from "./generate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "../components");

const HEADER_HTML = "<!-- GENERATED — do not hand-edit; regenerate through the pipeline. -->\n";
const HEADER_CSS = "/* GENERATED — do not hand-edit; regenerate through the pipeline. */\n";

export interface BuildTarget {
  definitionPath: string;
  outputName: string;
}

export function buildOne(target: BuildTarget): { name: string; bytes: number } {
  const definition = JSON.parse(readFileSync(target.definitionPath, "utf-8")) as ComponentDefinition;
  const generated = generateComponent(definition);

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(resolve(OUT_DIR, `${target.outputName}.js`), generated.source, "utf-8");
  writeFileSync(resolve(OUT_DIR, `${target.outputName}.template.html`), HEADER_HTML + generated.template + "\n", "utf-8");
  writeFileSync(resolve(OUT_DIR, `${target.outputName}.css`), HEADER_CSS + generated.css, "utf-8");

  return { name: target.outputName, bytes: generated.source.length };
}

// Registry-based generation order: atoms before molecules (composition
// closure requires children/parents already registered), ds-button last so
// its locked allowedParents ["ds-form-field", "ds-search-bar"] resolve
// against real registrations (CLAUDE.md M4). This build script only emits
// files; registration order is enforced separately wherever these
// definitions are run through the pipeline (see test/helpers.ts).
const TARGETS: BuildTarget[] = [
  { definitionPath: resolve(__dirname, "../definitions/ds-label.definition.json"), outputName: "ds-label" },
  { definitionPath: resolve(__dirname, "../definitions/ds-badge.definition.json"), outputName: "ds-badge" },
  { definitionPath: resolve(__dirname, "../definitions/ds-text-input.definition.json"), outputName: "ds-text-input" },
  { definitionPath: resolve(__dirname, "../definitions/ds-checkbox.definition.json"), outputName: "ds-checkbox" },
  { definitionPath: resolve(__dirname, "../definitions/ds-form-field.definition.json"), outputName: "ds-form-field" },
  { definitionPath: resolve(__dirname, "../definitions/ds-search-bar.definition.json"), outputName: "ds-search-bar" },
  { definitionPath: resolve(__dirname, "../specs/ds-button.definition.json"), outputName: "ds-button" },
];

export function runBuild(): void {
  for (const target of TARGETS) {
    const result = buildOne(target);
    console.log(`generated components/${result.name}.js (${result.bytes} bytes)`);
  }
}

function isMain(): boolean {
  const invoked = process.argv[1] ? resolve(process.argv[1]) : "";
  return invoked === fileURLToPath(import.meta.url);
}

if (isMain()) {
  try {
    runBuild();
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
