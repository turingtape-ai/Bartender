import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";

const port = Number(process.env.PORT) || 3000;
const app = createApp();

// Serve the built web app, if present, with an SPA fallback.
const here = dirname(fileURLToPath(import.meta.url));
const webDist = process.env.WEB_DIST ?? resolve(here, "../../../apps/web/dist");
if (existsSync(webDist)) {
  const root = webDist.startsWith(process.cwd()) ? webDist.slice(process.cwd().length + 1) : webDist;
  app.use("/*", serveStatic({ root }));
  app.get("/*", serveStatic({ root, path: "index.html" }));
  console.log(`Serving web app from ${webDist}`);
}

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Bartender API listening on http://localhost:${info.port}/api`);
});

export { createApp };
