export * from "./schema.js";
export * from "./units.js";
export * from "./glasses.js";
export * from "./diagram.js";
export * from "./recipes.js";
export { IBA_RECIPES } from "./data/index.js";

export const CATEGORY_LABELS: Record<import("./schema.js").Category, string> = {
  unforgettables: "The Unforgettables",
  "contemporary-classics": "Contemporary Classics",
  "new-era-drinks": "New Era Drinks",
};
