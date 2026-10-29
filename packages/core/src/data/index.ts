import { RecipeListSchema, type Recipe } from "../schema.js";
import { unforgettables } from "./unforgettables.js";
import { contemporaryClassics } from "./contemporary-classics.js";
import { newEraDrinks } from "./new-era-drinks.js";

/** All bundled recipes, validated against the schema at load time. */
export const IBA_RECIPES: Recipe[] = RecipeListSchema.parse([...unforgettables, ...contemporaryClassics, ...newEraDrinks]).sort((a, b) =>
  a.name.localeCompare(b.name),
);
