#!/usr/bin/env node
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  GLASS_IDS,
  METHODS,
  computeDiagram,
  diagramToSvg,
  formatAmount,
  getGlass,
  glassToSvg,
  listGlasses,
  recipes,
  type Recipe,
} from "@bartender/core";

/** Plain-text rendering of a recipe, handy for chat clients. */
function recipeToText(r: Recipe): string {
  const lines = [
    `# ${r.name}`,
    `${CATEGORY_LABELS[r.category]} · ${r.source.name}${r.source.url ? ` (${r.source.url})` : ""}`,
    "",
    r.description,
    "",
    `Glass: ${getGlass(r.glass).name} · Method: ${r.method} · Ice: ${r.ice}`,
    "",
    "## Ingredients",
    ...r.ingredients.map((i) => `- ${formatAmount(i.amount, "ml")} ${i.name}${i.role ? ` [${i.role}]` : ""}${i.note ? ` (${i.note})` : ""}`),
    "",
    "## Method",
    ...r.steps.map((s, n) => `${n + 1}. ${s}`),
    "",
    `Garnish: ${r.garnish}`,
  ];
  if (r.history) lines.push("", `History: ${r.history}`);
  return lines.join("\n");
}

function summary(r: Recipe) {
  return { id: r.id, name: r.name, category: r.category, glass: r.glass, method: r.method, ingredients: r.ingredients.map((i) => i.name).join(", ") };
}

export function createServer(): McpServer {
  const server = new McpServer({ name: "bartender", version: "0.1.0" });

  server.registerTool(
    "list_cocktails",
    {
      title: "List cocktails",
      description: "List the cocktails in the collection (IBA official list), optionally filtered by IBA category, glass or method.",
      inputSchema: {
        category: z.enum(CATEGORIES).optional().describe("IBA category"),
        glass: z.enum(GLASS_IDS).optional(),
        method: z.enum(METHODS).optional(),
      },
    },
    async ({ category, glass, method }) => {
      const results = recipes.search({ category, glass, method }).map(summary);
      return { content: [{ type: "text", text: JSON.stringify({ count: results.length, results }, null, 2) }] };
    },
  );

  server.registerTool(
    "search_cocktails",
    {
      title: "Search cocktails",
      description: "Search cocktails by free text and/or by ingredient (e.g. ingredient='gin', q='sour').",
      inputSchema: {
        q: z.string().optional().describe("Free text over name, description, tags and ingredient names"),
        ingredient: z.string().optional().describe("Ingredient id or name fragment, e.g. 'gin' or 'violette'"),
        category: z.enum(CATEGORIES).optional(),
        glass: z.enum(GLASS_IDS).optional(),
      },
    },
    async (query) => {
      const results = recipes.search(query).map(summary);
      return { content: [{ type: "text", text: JSON.stringify({ count: results.length, results }, null, 2) }] };
    },
  );

  server.registerTool(
    "get_cocktail",
    {
      title: "Get a cocktail recipe",
      description: "Full recipe for a cocktail by id (e.g. 'aviation'): ingredients with amounts, step-by-step instructions, glass, garnish and history.",
      inputSchema: {
        id: z.string().describe("Cocktail id, e.g. 'aviation'"),
        format: z.enum(["text", "json"]).optional().describe("Return markdown text (default) or the raw JSON recipe"),
      },
    },
    async ({ id, format }) => {
      const r = recipes.get(id) ?? recipes.search({ q: id })[0];
      if (!r) return { content: [{ type: "text", text: `No cocktail matches '${id}'. Use list_cocktails or search_cocktails to find ids.` }], isError: true };
      return { content: [{ type: "text", text: format === "json" ? JSON.stringify(r, null, 2) : recipeToText(r) }] };
    },
  );

  server.registerTool(
    "get_cocktail_diagram",
    {
      title: "Get the glass diagram",
      description: "Level diagram of a cocktail in its glass: each ingredient drawn as a layer proportional to its volume. Returns SVG plus the layer data.",
      inputSchema: {
        id: z.string().describe("Cocktail id, e.g. 'aviation'"),
        labels: z.boolean().optional().describe("Draw ingredient labels beside the glass (default true)"),
      },
    },
    async ({ id, labels }) => {
      const r = recipes.get(id);
      if (!r) return { content: [{ type: "text", text: `No cocktail with id '${id}'.` }], isError: true };
      const d = computeDiagram(r);
      const svg = diagramToSvg(d, { labels: labels ?? true });
      const layers = d.layers.map((l) => ({ ingredient: l.ingredient.name, ml: l.ml, percent: Math.round(l.fraction * 100), color: l.ingredient.color }));
      return {
        content: [
          { type: "text", text: JSON.stringify({ glass: d.glass.name, totalMl: d.totalMl, layers }, null, 2) },
          { type: "resource", resource: { uri: `cocktail://${r.id}/diagram.svg`, mimeType: "image/svg+xml", text: svg } },
        ],
      };
    },
  );

  server.registerTool(
    "list_glasses",
    { title: "List glass types", description: "The glassware catalogue with descriptions, capacities and which cocktails use each glass.", inputSchema: {} },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            listGlasses().map((g) => ({ id: g.id, name: g.name, description: g.description, capacityMl: g.capacityMl, cocktails: recipes.search({ glass: g.id }).map((r) => r.name) })),
            null,
            2,
          ),
        },
      ],
    }),
  );

  server.registerResource(
    "cocktail",
    new ResourceTemplate("cocktail://{id}", {
      list: async () => ({ resources: recipes.all().map((r) => ({ uri: `cocktail://${r.id}`, name: r.name, description: r.description, mimeType: "application/json" })) }),
    }),
    { title: "Cocktail recipe", description: "A cocktail recipe as JSON", mimeType: "application/json" },
    async (uri, { id }) => {
      const r = recipes.get(String(id));
      if (!r) throw new Error(`Unknown cocktail '${id}'`);
      return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(r, null, 2) }] };
    },
  );

  server.registerResource(
    "glass",
    new ResourceTemplate("glass://{id}.svg", {
      list: async () => ({ resources: listGlasses().map((g) => ({ uri: `glass://${g.id}.svg`, name: g.name, description: g.description, mimeType: "image/svg+xml" })) }),
    }),
    { title: "Glass outline", description: "Empty glass drawing as SVG", mimeType: "image/svg+xml" },
    async (uri, { id }) => {
      const glass = listGlasses().find((g) => g.id === String(id));
      if (!glass) throw new Error(`Unknown glass '${id}'`);
      return { contents: [{ uri: uri.href, mimeType: "image/svg+xml", text: glassToSvg(glass) }] };
    },
  );

  server.registerPrompt(
    "make_cocktail",
    {
      title: "Guide me through a cocktail",
      description: "Walk the user through making a cocktail step by step, with substitutions if they lack an ingredient.",
      argsSchema: { cocktail: z.string().describe("Cocktail name or id") },
    },
    ({ cocktail }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Use the get_cocktail tool to fetch the recipe for "${cocktail}". Then guide me through making it one step at a time, checking I have each ingredient and the right glass first. Offer sensible substitutions if I am missing something.`,
          },
        },
      ],
    }),
  );

  return server;
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain || process.env.BARTENDER_MCP_STDIO === "1") {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
