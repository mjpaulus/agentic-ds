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

const TARGETS: BuildTarget[] = [
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
