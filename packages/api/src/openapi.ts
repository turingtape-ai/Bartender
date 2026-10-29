import { CATEGORIES, GLASS_IDS, METHODS } from "@bartender/core";

/** Minimal OpenAPI 3.1 description of the public API. */
export const openapi = {
  openapi: "3.1.0",
  info: {
    title: "Bartender API",
    version: "0.1.0",
    description: "Cocktail recipes from the IBA official list, with glass level diagrams rendered as SVG.",
  },
  paths: {
    "/api/cocktails": {
      get: {
        summary: "List or search cocktails",
        parameters: [
          { name: "q", in: "query", schema: { type: "string" }, description: "Free text over name, description, tags and ingredients" },
          { name: "category", in: "query", schema: { type: "string", enum: CATEGORIES } },
          { name: "glass", in: "query", schema: { type: "string", enum: GLASS_IDS } },
          { name: "method", in: "query", schema: { type: "string", enum: METHODS } },
          { name: "ingredient", in: "query", schema: { type: "string" }, description: "Ingredient id (e.g. gin) or name fragment" },
          { name: "collection", in: "query", schema: { type: "string" }, description: "Recipe collection; the bundled list is 'iba'" },
        ],
        responses: { "200": { description: "Matching cocktails", content: { "application/json": { schema: { $ref: "#/components/schemas/CocktailList" } } } } },
      },
    },
    "/api/cocktails/{id}": {
      get: {
        summary: "Get a cocktail recipe",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "The recipe", content: { "application/json": { schema: { $ref: "#/components/schemas/Recipe" } } } }, "404": { description: "Not found" } },
      },
    },
    "/api/cocktails/{id}/diagram.svg": {
      get: {
        summary: "Glass level diagram as SVG",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "labels", in: "query", schema: { type: "boolean", default: true } },
          { name: "width", in: "query", schema: { type: "integer" } },
          { name: "background", in: "query", schema: { type: "string" }, description: "CSS colour" },
        ],
        responses: { "200": { description: "SVG image", content: { "image/svg+xml": {} } } },
      },
    },
    "/api/cocktails/{id}/diagram.json": {
      get: { summary: "Glass level diagram as data (layers with volumes and fractions)", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Diagram" } } },
    },
    "/api/glasses": { get: { summary: "List glass types", responses: { "200": { description: "Glasses" } } } },
    "/api/glasses/{id}": { get: { summary: "Glass details and the cocktails served in it", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", enum: GLASS_IDS } }], responses: { "200": { description: "Glass" } } } },
    "/api/glasses/{id}.svg": { get: { summary: "Empty glass outline as SVG", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", enum: GLASS_IDS } }], responses: { "200": { description: "SVG image" } } } },
    "/api/ingredients": { get: { summary: "Distinct ingredients with usage counts", responses: { "200": { description: "Ingredients" } } } },
    "/api/categories": { get: { summary: "IBA categories with counts", responses: { "200": { description: "Categories" } } } },
  },
  components: {
    schemas: {
      Amount: { type: "object", properties: { value: { type: "number" }, unit: { type: "string", enum: ["ml", "cl", "oz", "dash", "drop", "barspoon", "tsp", "piece", "top"] } }, required: ["value", "unit"] },
      Ingredient: {
        type: "object",
        properties: { id: { type: "string" }, name: { type: "string" }, amount: { $ref: "#/components/schemas/Amount" }, category: { type: "string" }, color: { type: "string" }, optional: { type: "boolean" }, note: { type: "string" } },
        required: ["id", "name", "amount", "category", "color"],
      },
      Recipe: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          collection: { type: "string" },
          category: { type: "string", enum: CATEGORIES },
          source: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, url: { type: "string" } } },
          description: { type: "string" },
          history: { type: "string" },
          glass: { type: "string", enum: GLASS_IDS },
          method: { type: "string", enum: METHODS },
          ice: { type: "string" },
          ingredients: { type: "array", items: { $ref: "#/components/schemas/Ingredient" } },
          garnish: { type: "string" },
          steps: { type: "array", items: { type: "string" } },
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["id", "name", "category", "glass", "method", "ice", "ingredients", "garnish", "steps"],
      },
      CocktailList: { type: "object", properties: { count: { type: "integer" }, results: { type: "array", items: { $ref: "#/components/schemas/Recipe" } } } },
    },
  },
} as const;
