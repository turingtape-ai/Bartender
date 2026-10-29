import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CATEGORY_LABELS, computeDiagram, formatAmount, getGlass, recipes, toMl } from "@bartender/core";
import GlassDiagram from "../components/GlassDiagram";
import { usePreferences } from "../preferences";

const METHOD_LABEL: Record<string, string> = {
  shake: "Shaken",
  stir: "Stirred",
  build: "Built in the glass",
  blend: "Blended",
  muddle: "Muddled",
  layer: "Layered",
  swizzle: "Swizzled",
  throw: "Thrown / rolled",
};

const ICE_LABEL: Record<string, string> = {
  none: "Served up, no ice",
  cubes: "Over ice cubes",
  crushed: "Over crushed ice",
  "large-cube": "Over a large cube",
  sphere: "Over an ice sphere",
};

export default function CocktailPage() {
  const { id } = useParams();
  const recipe = id ? recipes.get(id) : undefined;
  const { unit } = usePreferences();
  const [highlight, setHighlight] = useState<string | null>(null);
  const [servings, setServings] = useState(1);
  const [done, setDone] = useState<Set<number>>(new Set());
  const [guided, setGuided] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    setHighlight(null);
    setServings(1);
    setDone(new Set());
    setGuided(false);
    setStep(0);
    window.scrollTo({ top: 0 });
  }, [id]);

  useEffect(() => {
    if (!guided || !recipe) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setStep((s) => Math.min(recipe.steps.length - 1, s + 1));
      if (e.key === "ArrowLeft") setStep((s) => Math.max(0, s - 1));
      if (e.key === "Escape") setGuided(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [guided, recipe]);

  const diagram = useMemo(() => (recipe ? computeDiagram(recipe) : null), [recipe]);

  if (!recipe || !diagram) {
    return (
      <section className="empty">
        <h1>Not found</h1>
        <p>
          No cocktail called “{id}”. <Link to="/">Back to the list</Link>.
        </p>
      </section>
    );
  }

  const glass = getGlass(recipe.glass);
  const toggleDone = (i: number) =>
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  const progress = Math.round((done.size / recipe.steps.length) * 100);
  const selected = highlight ? diagram.layers.find((l) => l.ingredient.id === highlight) : undefined;
  const totalMl = diagram.totalMl * servings;

  return (
    <article className="cocktail-page">
      <nav className="breadcrumb small muted">
        <Link to="/">Cocktails</Link> / <Link to={`/?category=${recipe.category}`}>{CATEGORY_LABELS[recipe.category]}</Link>
      </nav>

      <header className="cocktail-header">
        <h1>{recipe.name}</h1>
        <p className="lede">{recipe.description}</p>
        <ul className="facts">
          <li>
            <span className="fact-label">Glass</span>
            <Link to="/glasses">{glass.name}</Link>
          </li>
          <li>
            <span className="fact-label">Method</span>
            {METHOD_LABEL[recipe.method]}
          </li>
          <li>
            <span className="fact-label">Ice</span>
            {ICE_LABEL[recipe.ice]}
          </li>
          <li>
            <span className="fact-label">Garnish</span>
            {recipe.garnish}
          </li>
        </ul>
      </header>

      <div className="cocktail-layout">
        <section className="diagram-panel" aria-label="Glass diagram">
          <GlassDiagram recipe={recipe} highlight={highlight} onHighlight={setHighlight} formatAmount={(ing) => formatAmount(ing.amount, unit, servings)} />
          {selected ? (
            <p className="selected-layer center" aria-live="polite">
              <span className="swatch" style={{ background: selected.ingredient.color }} aria-hidden="true" />
              <strong>{selected.ingredient.name}</strong>
              <span className="muted">
                {" "}
                · {formatAmount(selected.ingredient.amount, unit, servings)} · {Math.round(selected.fraction * 100)}% of the drink
              </span>
            </p>
          ) : (
            <p className="muted small center">
              Tap a layer, or one of the dots beside the glass, to see what it is. Each band's volume matches its share of the {Math.round(diagram.totalMl)} ml recipe in a real{" "}
              {glass.name.toLowerCase()}.
            </p>
          )}
        </section>

        <section className="recipe-panel">
          <div className="panel-head">
            <h2>Ingredients</h2>
            <div className="servings" role="group" aria-label="Servings">
              <button type="button" onClick={() => setServings((s) => Math.max(1, s - 1))} aria-label="Fewer servings" disabled={servings === 1}>
                −
              </button>
              <span>
                {servings} {servings === 1 ? "drink" : "drinks"}
              </span>
              <button type="button" onClick={() => setServings((s) => Math.min(8, s + 1))} aria-label="More servings" disabled={servings === 8}>
                +
              </button>
            </div>
          </div>
          <ul
            className="ingredient-list"
            onPointerLeave={(e) => {
              if (e.pointerType === "mouse") setHighlight(null);
            }}
          >
            {recipe.ingredients.map((ing) => {
              const layer = diagram.layers.find((l) => l.ingredient.id === ing.id);
              const active = highlight === ing.id;
              return (
                <li
                  key={ing.id}
                  className={`ingredient ${active ? "active" : ""} ${highlight && !active ? "dim" : ""}`}
                  onPointerEnter={(e) => {
                    if (e.pointerType === "mouse") setHighlight(ing.id);
                  }}
                  onClick={() => setHighlight(active ? null : ing.id)}
                >
                  <span className="swatch" style={{ background: ing.color }} aria-hidden="true" />
                  <span className="amount">{formatAmount(ing.amount, unit, servings)}</span>
                  <span className="name">
                    <Link to={`/?q=${encodeURIComponent(ing.name)}`} onClick={(e) => e.stopPropagation()}>
                      {ing.name}
                    </Link>
                    {ing.role === "rinse" && <span className="tag">rinse</span>}
                    {ing.role === "float" && <span className="tag">float</span>}
                    {!layer && !ing.role && toMl(ing.amount) === 0 && <span className="tag">solid</span>}
                    {ing.note && <span className="muted small"> · {ing.note}</span>}
                  </span>
                  {layer && (
                    <span className="share">
                      <span className="bar" style={{ width: `${Math.round(layer.fraction * 100)}%`, background: ing.color }} />
                      <span className="pct">{Math.round(layer.fraction * 100)}%</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="muted small">
            About {Math.round(totalMl)} ml before dilution{servings > 1 ? ` for ${servings} drinks` : ""}. Garnish: {recipe.garnish}.
          </p>

          <div className="panel-head">
            <h2>Method</h2>
            <button type="button" className="button" onClick={() => setGuided((g) => !g)}>
              {guided ? "Show all steps" : "Make it step by step"}
            </button>
          </div>

          {guided ? (
            <div className="guided" aria-live="polite">
              <div className="guided-progress">
                Step {step + 1} of {recipe.steps.length}
                <span className="progress">
                  <span style={{ width: `${((step + 1) / recipe.steps.length) * 100}%` }} />
                </span>
              </div>
              <p className="guided-step">{recipe.steps[step]}</p>
              <div className="guided-nav">
                <button type="button" className="button secondary" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
                  ← Back
                </button>
                {step < recipe.steps.length - 1 ? (
                  <button type="button" className="button" onClick={() => setStep((s) => s + 1)}>
                    Next →
                  </button>
                ) : (
                  <button type="button" className="button" onClick={() => setGuided(false)}>
                    Done, cheers!
                  </button>
                )}
              </div>
              <p className="muted small">Use ← → on the keyboard to move between steps, Esc to leave.</p>
            </div>
          ) : (
            <>
              <ol className="steps">
                {recipe.steps.map((s, i) => (
                  <li key={i} className={done.has(i) ? "done" : ""}>
                    <label>
                      <input type="checkbox" checked={done.has(i)} onChange={() => toggleDone(i)} />
                      <span>{s}</span>
                    </label>
                  </li>
                ))}
              </ol>
              {done.size > 0 && (
                <p className="muted small">
                  {progress}% done{progress === 100 ? " — enjoy!" : ""}{" "}
                  <button type="button" className="link" onClick={() => setDone(new Set())}>
                    reset
                  </button>
                </p>
              )}
            </>
          )}

          {recipe.history && (
            <>
              <h2>History</h2>
              <p>{recipe.history}</p>
            </>
          )}

          <h2>Use this recipe elsewhere</h2>
          <ul className="links small">
            {import.meta.env.VITE_ROUTER !== "hash" && (
            <li>
              <a href={`/api/cocktails/${recipe.id}`}>JSON</a> · <a href={`/api/cocktails/${recipe.id}/diagram.svg`}>diagram SVG</a> ·{" "}
              <a href={`/api/cocktails/${recipe.id}/diagram.json`}>diagram data</a>
            </li>
            )}
            <li>
              MCP: <code>get_cocktail {`{ "id": "${recipe.id}" }`}</code>
            </li>
            {recipe.source.url && (
              <li>
                Source: <a href={recipe.source.url}>{recipe.source.name}</a>
              </li>
            )}
          </ul>
        </section>
      </div>
    </article>
  );
}
