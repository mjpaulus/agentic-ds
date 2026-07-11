import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseTokens } from "./parser.js";
import { validateRules } from "./validate-rules.js";
import { emitCss, writeCssFiles } from "./emit.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPECS_PATH = resolve(__dirname, "../specs/tokens.json");
const DIST_DIR = resolve(__dirname, "./dist");

describe("P1b: primitive compile-away", () => {
  it("emits zero occurrences of --prim in any in-memory emitted CSS block", () => {
    const data = parseTokens(SPECS_PATH);
    validateRules(data);
    const emitted = emitCss(data);
    for (const css of Object.values(emitted.perContext)) {
      expect(css).not.toContain("--prim");
    }
    expect(emitted.combined).not.toContain("--prim");
  });

  it("emits zero occurrences of --prim in every file actually written to tokens/dist/", () => {
    const data = parseTokens(SPECS_PATH);
    validateRules(data);
    const emitted = emitCss(data);
    writeCssFiles(emitted, DIST_DIR);

    expect(existsSync(DIST_DIR)).toBe(true);
    const files = readdirSync(DIST_DIR).filter((f: string) => f.endsWith(".css"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const contents = readFileSync(`${DIST_DIR}/${file}`, "utf-8");
      expect(contents).not.toContain("--prim");
    }
  });
});
