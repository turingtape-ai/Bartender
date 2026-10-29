import { z } from "zod";

/**
 * Recipe model.
 *
 * Designed to outlive the IBA-only phase: every recipe carries a `source`
 * (who published it) and a `collection` (which list it belongs to), so that
 * bars and people can later contribute their own recipes alongside the IBA set
 * without a schema change.
 */

export const UNITS = [
  "ml", // millilitres (canonical liquid unit)
  "cl", // centilitres (IBA publishes in cl)
  "oz", // US fluid ounces
  "dash",
  "drop",
  "barspoon",
  "tsp",
  "piece", // whole items: a sugar cube, a mint sprig, an egg white counts as ml
  "top", // "top up with" – amount is an approximate fill in ml
] as const;
export type Unit = (typeof UNITS)[number];

/** Approximate millilitres for a single unit; used for the level diagram. */
export const UNIT_TO_ML: Record<Unit, number> = {
  ml: 1,
  cl: 10,
  oz: 29.5735,
  dash: 0.9,
  drop: 0.05,
  barspoon: 5,
  tsp: 5,
  piece: 0,
  top: 1,
};

export const INGREDIENT_CATEGORIES = [
  "spirit",
  "liqueur",
  "fortified-wine",
  "wine",
  "beer",
  "juice",
  "syrup",
  "bitters",
  "mixer",
  "dairy",
  "egg",
  "fruit",
  "herb",
  "sweetener",
  "other",
] as const;
export type IngredientCategory = (typeof INGREDIENT_CATEGORIES)[number];

export const METHODS = ["shake", "stir", "build", "blend", "muddle", "layer", "swizzle", "throw"] as const;
export type Method = (typeof METHODS)[number];

export const ICE_STYLES = ["none", "cubes", "crushed", "large-cube", "sphere"] as const;
export type IceStyle = (typeof ICE_STYLES)[number];

export const CATEGORIES = ["unforgettables", "contemporary-classics", "new-era-drinks"] as const;
export type Category = (typeof CATEGORIES)[number];

export const GLASS_IDS = [
  "coupe",
  "martini",
  "nick-and-nora",
  "rocks",
  "highball",
  "collins",
  "flute",
  "hurricane",
  "copper-mug",
  "irish-coffee",
  "wine",
  "julep-cup",
  "goblet",
  "sling",
  "punch-cup",
] as const;
export type GlassId = (typeof GLASS_IDS)[number];

export const AmountSchema = z.object({
  value: z.number().nonnegative(),
  unit: z.enum(UNITS),
});
export type Amount = z.infer<typeof AmountSchema>;

export const IngredientSchema = z.object({
  /** Stable slug for cross-recipe search, e.g. "gin", "lemon-juice". */
  id: z.string().regex(/^[a-z0-9-]+$/),
  /** Display name as the recipe wants it, e.g. "Gin", "Fresh lemon juice". */
  name: z.string().min(1),
  amount: AmountSchema,
  category: z.enum(INGREDIENT_CATEGORIES),
  /** Colour used for this ingredient's layer in the glass diagram. */
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  /** When true the ingredient is drawn as a thin accent rather than a layer. */
  optional: z.boolean().optional(),
  note: z.string().optional(),
});
export type Ingredient = z.infer<typeof IngredientSchema>;

export const SourceSchema = z.object({
  /** "iba" for the official list; later: a bar or user id. */
  id: z.string(),
  name: z.string(),
  url: z.string().url().optional(),
});
export type Source = z.infer<typeof SourceSchema>;

export const RecipeSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  /** Collection the recipe belongs to. The IBA list uses "iba". */
  collection: z.string().default("iba"),
  category: z.enum(CATEGORIES),
  source: SourceSchema,
  description: z.string(),
  glass: z.enum(GLASS_IDS),
  method: z.enum(METHODS),
  ice: z.enum(ICE_STYLES),
  ingredients: z.array(IngredientSchema).min(1),
  garnish: z.string(),
  steps: z.array(z.string().min(1)).min(1),
  tags: z.array(z.string()).default([]),
  /** Rough history / trivia; shown on the detail page. */
  history: z.string().optional(),
});
export type Recipe = z.infer<typeof RecipeSchema>;
export type RecipeInput = z.input<typeof RecipeSchema>;

export const RecipeListSchema = z.array(RecipeSchema);
