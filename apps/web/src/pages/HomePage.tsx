import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CATEGORIES, CATEGORY_LABELS, GLASSES, GLASS_IDS, recipes, type Category, type GlassId } from "@bartender/core";
import CocktailCard from "../components/CocktailCard";

const SPIRITS: Array<{ id: string; label: string }> = [
  { id: "gin", label: "Gin" },
  { id: "vodka", label: "Vodka" },
  { id: "rum", label: "Rum" },
  { id: "whisk", label: "Whisk(e)y" },
  { id: "tequila", label: "Tequila" },
  { id: "cognac", label: "Cognac / brandy" },
  { id: "vermouth", label: "Vermouth" },
  { id: "champagne", label: "Sparkling" },
];

export default function HomePage() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const category = params.get("category") as Category | null;
  const spirit = params.get("spirit");
  const glass = params.get("glass") as GlassId | null;

  const update = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const results = useMemo(() => {
    let list = recipes.search({ q: q || undefined, category: category ?? undefined, glass: glass ?? undefined });
    if (spirit) {
      const needle = spirit === "cognac" ? ["cognac", "brandy"] : [spirit];
      list = list.filter((r) => r.ingredients.some((i) => needle.some((n) => i.id.includes(n) || i.name.toLowerCase().includes(n))));
    }
    return list;
  }, [q, category, glass, spirit]);

  return (
    <>
      <section className="hero">
        <h1>The IBA cocktails, drawn to scale.</h1>
        <p className="lede">
          Every official IBA recipe with step-by-step instructions and a diagram of the glass showing how much of each ingredient goes in. Start with the{" "}
          <a href="/cocktails/aviation">Aviation</a>.
        </p>
      </section>

      <section className="filters" aria-label="Filters">
        <input
          type="search"
          className="search"
          placeholder="Search by name or ingredient (e.g. violette, sour, rye)…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            update("q", e.target.value || null);
          }}
        />
        <div className="chips" role="group" aria-label="Category">
          <button type="button" className={!category ? "chip active" : "chip"} onClick={() => update("category", null)}>
            All
          </button>
          {CATEGORIES.map((c) => (
            <button key={c} type="button" className={category === c ? "chip active" : "chip"} onClick={() => update("category", category === c ? null : c)}>
              {CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
        <div className="chips" role="group" aria-label="Base spirit">
          {SPIRITS.map((s) => (
            <button key={s.id} type="button" className={spirit === s.id ? "chip active" : "chip"} onClick={() => update("spirit", spirit === s.id ? null : s.id)}>
              {s.label}
            </button>
          ))}
          <select className="select" value={glass ?? ""} onChange={(e) => update("glass", e.target.value || null)} aria-label="Glass">
            <option value="">Any glass</option>
            {GLASS_IDS.map((g) => (
              <option key={g} value={g}>
                {GLASSES[g].name}
              </option>
            ))}
          </select>
        </div>
      </section>

      <p className="muted small result-count">
        {results.length} of {recipes.all().length} cocktails
      </p>
      <section className="grid">
        {results.map((r) => (
          <CocktailCard key={r.id} recipe={r} />
        ))}
      </section>
      {results.length === 0 && <p className="empty">Nothing matches. Try a different spelling, or clear the filters.</p>}
    </>
  );
}
