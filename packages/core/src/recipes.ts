import { IBA_RECIPES } from "./data/index.js";
import type { Category, GlassId, Recipe } from "./schema.js";

export interface RecipeQuery {
  /** Free text: matched against name, description, tags and ingredient names. */
  q?: string;
  category?: Category;
  glass?: GlassId;
  /** Ingredient id (e.g. "gin") or a fragment of an ingredient name. */
  ingredient?: string;
  method?: Recipe["method"];
  collection?: string;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** The in-memory recipe repository. Swappable for a database later. */
export class RecipeRepository {
  constructor(private readonly recipes: Recipe[] = IBA_RECIPES) {}

  all(): Recipe[] {
    return this.recipes;
  }

  get(id: string): Recipe | undefined {
    return this.recipes.find((r) => r.id === id);
  }

  search(query: RecipeQuery = {}): Recipe[] {
    const q = query.q ? norm(query.q) : undefined;
    const ing = query.ingredient ? norm(query.ingredient) : undefined;
    return this.recipes.filter((r) => {
      if (query.category && r.category !== query.category) return false;
      if (query.glass && r.glass !== query.glass) return false;
      if (query.method && r.method !== query.method) return false;
      if (query.collection && r.collection !== query.collection) return false;
      if (ing && !r.ingredients.some((i) => i.id === ing || norm(i.name).includes(ing) || i.id.includes(ing))) return false;
      if (q) {
        const hay = [r.name, r.description, ...r.tags, ...r.ingredients.map((i) => i.name)].map(norm).join(" ");
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  /** Distinct ingredients across the repository, with usage counts. */
  ingredients(): Array<{ id: string; name: string; category: string; count: number }> {
    const map = new Map<string, { id: string; name: string; category: string; count: number }>();
    for (const r of this.recipes) {
      for (const i of r.ingredients) {
        const entry = map.get(i.id);
        if (entry) entry.count += 1;
        else map.set(i.id, { id: i.id, name: i.name, category: i.category, count: 1 });
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }
}

export const recipes = new RecipeRepository();
