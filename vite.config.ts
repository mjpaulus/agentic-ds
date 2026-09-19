// Dev server config (none existed before M6). Adds POST /api/adapt and GET
// /api/adapt/status as Vite middleware (constraint-enforcement-spec.md
// Section 7: "Nothing in the pipeline assumes its trigger is a build
// step" — this is that seam wired to an HTTP boundary). The TypeSafe API
// key is read here, server-side, via process.env, and is NEVER forwarded
// to the browser: the response only ever carries a decision + mode string.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage } from "node:http";
import type { Plugin, ViteDevServer } from "vite";
import { defineConfig, loadEnv } from "vite";
import { ADAPTATION_MODEL, CONTRACT_VERSION, THRESHOLDS } from "./adaptation/contract.js";
import { decideWithFallback } from "./adaptation/decider.js";
import { RecordedAdaptationDecider, type FixtureFile } from "./adaptation/backends/recorded.js";
import { TypeSafeAdaptationDecider } from "./adaptation/backends/typesafe.js";
import { seedRegistry, catalogFrom } from "./demo/registry-seed.js";
import type { ContextId } from "./adaptation/contract.js";
import type { Registry } from "./registry/registry.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(__dirname, "adaptation/fixtures/recorded-answers.json");

// A gitignored .env.local is the supported place for the key. It is
// loaded into the server process only; Vite exposes nothing to the client
// without a VITE_ prefix, and the middleware never forwards it.
const localEnv = loadEnv("development", __dirname, "");
if (!process.env.TYPESAFE_API_KEY && localEnv.TYPESAFE_API_KEY) {
  process.env.TYPESAFE_API_KEY = localEnv.TYPESAFE_API_KEY;
}

function loadFixtures(): FixtureFile {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf-8")) as FixtureFile;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolvePromise(data));
    req.on("error", reject);
  });
}

function adaptationApiPlugin(): Plugin {
  let registry: Registry | undefined;
  let catalog: ReturnType<typeof catalogFrom> | undefined;

  async function ensureRegistry() {
    if (!registry) {
      registry = await seedRegistry();
      catalog = catalogFrom(registry);
    }
    return { registry, catalog: catalog! };
  }

  return {
    name: "agentic-ds-adaptation-api",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url) return next();
        const url = new URL(req.url, "http://localhost");

        if (req.method === "GET" && url.pathname === "/api/adapt/status") {
          const live = Boolean(process.env.TYPESAFE_API_KEY);
          const fixtures = loadFixtures();
          res.setHeader("content-type", "application/json");
          res.end(
            JSON.stringify({
              mode: live ? "live" : "recorded",
              model: ADAPTATION_MODEL,
              contractVersion: CONTRACT_VERSION,
              fixtureProvenance: fixtures.provenance,
              thresholds: THRESHOLDS,
            })
          );
          return;
        }

        if (req.method === "POST" && url.pathname === "/api/adapt") {
          try {
            const body = await readBody(req);
            const { task, currentContext } = JSON.parse(body) as { task: string; currentContext: ContextId };
            const { registry: reg, catalog: cat } = await ensureRegistry();

            const live = Boolean(process.env.TYPESAFE_API_KEY);
            const decider = live ? new TypeSafeAdaptationDecider() : new RecordedAdaptationDecider(loadFixtures());

            const decision = await decideWithFallback(
              decider,
              { task, currentContext, catalog: cat },
              reg,
              { model: ADAPTATION_MODEL, contractVersion: CONTRACT_VERSION }
            );

            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ decision, mode: decision.record.mode }));
          } catch (error) {
            res.statusCode = 500;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
          }
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [adaptationApiPlugin()],
});
