import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseTokens } from "./parser.js";
import { validateRules } from "./validate-rules.js";
import { emitCss, writeCssFiles } from "./emit.js";

export { parseTokens } from "./parser.js";
export { validateRules } from "./validate-rules.js";
export { emitCss, writeCssFiles } from "./emit.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPECS_PATH = resolve(__dirname, "../specs/tokens.json");
const OUT_DIR = resolve(__dirname, "dist");

export function runBuild(specsPath: string = SPECS_PATH, outDir: string = OUT_DIR): string[] {
  const data = parseTokens(specsPath);
  validateRules(data);
  const emitted = emitCss(data);
  return writeCssFiles(emitted, outDir);
}

function isMain(): boolean {
  const invoked = process.argv[1] ? resolve(process.argv[1]) : "";
  return invoked === fileURLToPath(import.meta.url);
}

if (isMain()) {
  try {
    const written = runBuild();
    for (const path of written) {
      console.log(`wrote ${path}`);
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
