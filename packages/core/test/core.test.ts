import { describe, expect, it } from "vitest";
import {
  CATEGORIES,
  GLASSES,
  IBA_RECIPES,
  RecipeSchema,
  computeDiagram,
  diagramToSvg,
  formatAmount,
  glassProfile,
  profileVolume,
  recipes,
  toMl,
  yForVolume,
} from "../src/index.js";

describe("IBA data", () => {
  it("validates every recipe against the schema", () => {
    for (const r of IBA_RECIPES) expect(() => RecipeSchema.parse(r)).not.toThrow();
  });

  it("has unique ids", () => {
    const ids = IBA_RECIPES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers every category", () => {
    for (const c of CATEGORIES) expect(IBA_RECIPES.some((r) => r.category === c)).toBe(true);
  });

  it("has at least one liquid ingredient per recipe", () => {
    for (const r of IBA_RECIPES) expect(r.ingredients.some((i) => toMl(i.amount) > 0), r.id).toBe(true);
  });

  it("finds the Aviation", () => {
    const aviation = recipes.get("aviation");
    expect(aviation?.name).toBe("Aviation");
    expect(aviation?.ingredients.map((i) => i.id)).toEqual(["gin", "maraschino-liqueur", "lemon-juice", "creme-de-violette"]);
    expect(recipes.search({ ingredient: "violette" }).map((r) => r.id)).toContain("aviation");
    expect(recipes.search({ q: "aviat" }).map((r) => r.id)).toEqual(["aviation"]);
  });
});

describe("units", () => {
  it("converts to ml", () => {
    expect(toMl({ value: 3, unit: "cl" })).toBe(30);
    expect(toMl({ value: 1, unit: "oz" })).toBeCloseTo(29.57, 1);
    expect(toMl({ value: 1, unit: "piece" })).toBe(0);
  });
  it("formats amounts", () => {
    expect(formatAmount({ value: 45, unit: "ml" }, "ml")).toBe("45 ml");
    expect(formatAmount({ value: 45, unit: "ml" }, "oz")).toBe("1.5 oz");
    expect(formatAmount({ value: 45, unit: "ml" }, "cl")).toBe("4.5 cl");
    expect(formatAmount({ value: 2, unit: "dash" }, "oz")).toBe("2 dashes");
    expect(formatAmount({ value: 1, unit: "barspoon" }, "ml")).toBe("1 bar spoon");
    expect(formatAmount({ value: 45, unit: "ml" }, "ml", 2)).toBe("90 ml");
  });
});

describe("glass geometry", () => {
  it("every glass has a usable profile", () => {
    for (const g of Object.values(GLASSES)) {
      const p = glassProfile(g);
      expect(p.length).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < p.length; i++) expect(p[i].y).toBeLessThan(p[i - 1].y);
      expect(profileVolume(p)).toBeGreaterThan(0);
    }
  });

  it("maps volume to height monotonically", () => {
    const p = glassProfile(GLASSES.coupe);
    const total = profileVolume(p);
    expect(yForVolume(p, 0)).toBe(p[0].y);
    expect(yForVolume(p, total)).toBeCloseTo(p[p.length - 1].y, 0);
    const half = yForVolume(p, total / 2);
    const quarter = yForVolume(p, total / 4);
    expect(half).toBeLessThan(quarter);
  });
});

describe("diagram", () => {
  it("stacks the Aviation in the right proportions", () => {
    const d = computeDiagram(recipes.get("aviation")!);
    expect(d.layers.map((l) => l.ingredient.id)).toEqual(["gin", "maraschino-liqueur", "lemon-juice", "creme-de-violette"]);
    expect(d.layers[0].fraction).toBeCloseTo(45 / 80, 3);
    for (let i = 1; i < d.layers.length; i++) {
      expect(d.layers[i].yBottom).toBeCloseTo(d.layers[i - 1].yTop, 5);
    }
    expect(d.liquidTopY).toBeLessThan(d.profile[0].y);
    expect(d.ice).toHaveLength(0);
  });

  it("shows a neat pour low in a tumbler and a shaken drink high in a coupe", () => {
    const sazerac = computeDiagram(recipes.get("sazerac")!);
    const profile = sazerac.profile;
    const span = profile[0].y - profile[profile.length - 1].y;
    expect((profile[0].y - sazerac.liquidTopY) / span).toBeLessThan(0.45);
    const aviation = computeDiagram(recipes.get("aviation")!);
    const p2 = aviation.profile;
    expect((p2[0].y - aviation.liquidTopY) / (p2[0].y - p2[p2.length - 1].y)).toBeGreaterThan(0.6);
  });

  it("renders every recipe to SVG", () => {
    for (const r of IBA_RECIPES) {
      const svg = diagramToSvg(computeDiagram(r));
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).toContain(r.ingredients[0].name.replace(/&/g, "&amp;"));
    }
  });
});
