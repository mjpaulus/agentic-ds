// Node-backed JSON-file persistence for the Registry. Kept out of
// registry.ts itself so that file stays import-clean for browser callers
// (telemetry/gate.ts, telemetry/evolution.ts, and the demo page all touch a
// Registry instance without ever pulling in node:fs). Node-side tooling
// (build scripts, CLI usage) that wants durable persistence constructs a
// Registry with `new Registry(jsonFilePersistence(path))`.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { RegistryEntry, RegistryPersistence } from "./registry.js";

export function jsonFilePersistence(path: string): RegistryPersistence {
  return {
    load(): RegistryEntry[] {
      if (!existsSync(path)) return [];
      const raw = readFileSync(path, "utf-8");
      return JSON.parse(raw) as RegistryEntry[];
    },
    save(entries: RegistryEntry[]): void {
      const dir = dirname(path);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(path, JSON.stringify(entries, null, 2), "utf-8");
    },
  };
}
