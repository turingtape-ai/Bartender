import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  GLASS_IDS,
  METHODS,
  computeDiagram,
  diagramToSvg,
  getGlass,
  glassToSvg,
  listGlasses,
  recipes as defaultRepository,
  type Category,
  type GlassId,
  type Method,
  type Recipe,
  type RecipeRepository,
} from "@bartender/core";
import { openapi } from "./openapi.js";

export interface AppOptions {
  repository?: RecipeRepository;
}

function links(id: string) {
  return {
    self: `/api/cocktails/${id}`,
    diagramSvg: `/api/cocktails/${id}/diagram.svg`,
    diagramJson: `/api/cocktails/${id}/diagram.json`,
  };
}

function summary(r: Recipe) {
  return {
    id: r.id,
    name: r.name,
    collection: r.collection,
    category: r.category,
    categoryLabel: CATEGORY_LABELS[r.category],
    glass: r.glass,
    method: r.method,
    ice: r.ice,
    description: r.description,
    ingredients: r.ingredients.map((i) => ({ id: i.id, name: i.name, amount: i.amount })),
    tags: r.tags,
    links: links(r.id),
  };
}

function isOneOf<T extends string>(values: readonly T[], v: string | undefined): v is T {
  return v !== undefined && (values as readonly string[]).includes(v);
}

/** Build the API as a framework-agnostic Hono app (runs on Node, Bun, Deno, Workers...). */
export function createApp(options: AppOptions = {}) {
  const repo = options.repository ?? defaultRepository;
  const app = new Hono();

  app.use("/api/*", cors());

  app.get("/api", (c) =>
    c.json({
      name: "Bartender API",
      version: "0.1.0",
      description: "IBA cocktail recipes with glass level diagrams.",
      endpoints: {
        cocktails: "/api/cocktails?q=&category=&glass=&ingredient=&method=",
        cocktail: "/api/cocktails/{id}",
        diagramSvg: "/api/cocktails/{id}/diagram.svg?labels=true&width=420",
        diagramJson: "/api/cocktails/{id}/diagram.json",
        glasses: "/api/glasses",
        glass: "/api/glasses/{id}",
        glassSvg: "/api/glasses/{id}.svg",
        ingredients: "/api/ingredients",
        categories: "/api/categories",
        openapi: "/api/openapi.json",
      },
    }),
  );

  app.get("/api/openapi.json", (c) => c.json(openapi));

  app.get("/api/categories", (c) =>
    c.json(CATEGORIES.map((id) => ({ id, label: CATEGORY_LABELS[id], count: repo.search({ category: id }).length }))),
  );

  app.get("/api/cocktails", (c) => {
    const category = c.req.query("category");
    const glass = c.req.query("glass");
    const method = c.req.query("method");
    if (category && !isOneOf(CATEGORIES, category)) return c.json({ error: `Unknown category '${category}'`, allowed: CATEGORIES }, 400);
    if (glass && !isOneOf(GLASS_IDS, glass)) return c.json({ error: `Unknown glass '${glass}'`, allowed: GLASS_IDS }, 400);
    if (method && !isOneOf(METHODS, method)) return c.json({ error: `Unknown method '${method}'`, allowed: METHODS }, 400);
    const results = repo.search({
      q: c.req.query("q") || undefined,
      ingredient: c.req.query("ingredient") || undefined,
      collection: c.req.query("collection") || undefined,
      category: category as Category | undefined,
      glass: glass as GlassId | undefined,
      method: method as Method | undefined,
    });
    return c.json({ count: results.length, results: results.map(summary) });
  });

  app.get("/api/cocktails/:id", (c) => {
    const recipe = repo.get(c.req.param("id"));
    if (!recipe) return c.json({ error: "Not found" }, 404);
    return c.json({ ...recipe, categoryLabel: CATEGORY_LABELS[recipe.category], glassDetails: getGlass(recipe.glass), links: links(recipe.id) });
  });

  app.get("/api/cocktails/:id/diagram.json", (c) => {
    const recipe = repo.get(c.req.param("id"));
    if (!recipe) return c.json({ error: "Not found" }, 404);
    const d = computeDiagram(recipe);
    return c.json({
      id: recipe.id,
      glass: { id: d.glass.id, name: d.glass.name, capacityMl: d.glass.capacityMl },
      totalMl: d.totalMl,
      layers: d.layers.map((l) => ({
        ingredient: l.ingredient.id,
        name: l.ingredient.name,
        ml: l.ml,
        fraction: l.fraction,
        color: l.ingredient.color,
        yTop: l.yTop,
        yBottom: l.yBottom,
      })),
      solids: d.solids.map((s) => s.id),
      ice: recipe.ice,
    });
  });

  app.get("/api/cocktails/:id/diagram.svg", (c) => {
    const recipe = repo.get(c.req.param("id"));
    if (!recipe) return c.json({ error: "Not found" }, 404);
    const labels = c.req.query("labels") !== "false" && c.req.query("labels") !== "0";
    const width = Number(c.req.query("width")) || undefined;
    const background = c.req.query("background") || undefined;
    const svg = diagramToSvg(computeDiagram(recipe), { labels, width, background });
    return c.body(svg, 200, { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=3600" });
  });

  app.get("/api/glasses", (c) =>
    c.json(
      listGlasses().map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        capacityMl: g.capacityMl,
        material: g.material ?? "glass",
        svg: `/api/glasses/${g.id}.svg`,
      })),
    ),
  );

  app.get("/api/glasses/:id", (c) => {
    const raw = c.req.param("id");
    const wantsSvg = raw.endsWith(".svg");
    const id = wantsSvg ? raw.slice(0, -4) : raw;
    if (!isOneOf(GLASS_IDS, id)) return c.json({ error: "Not found" }, 404);
    const glass = getGlass(id);
    if (wantsSvg) {
      return c.body(glassToSvg(glass, { width: Number(c.req.query("width")) || undefined }), 200, {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, max-age=86400",
      });
    }
    return c.json({ ...glass, cocktails: repo.search({ glass: id }).map((r) => ({ id: r.id, name: r.name })) });
  });

  app.get("/api/ingredients", (c) => c.json(repo.ingredients()));

  app.notFound((c) => (c.req.path.startsWith("/api") ? c.json({ error: "Not found" }, 404) : c.text("Not found", 404)));

  return app;
}

export type App = ReturnType<typeof createApp>;
