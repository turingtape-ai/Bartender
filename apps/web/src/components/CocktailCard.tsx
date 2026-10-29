import { Link } from "react-router-dom";
import { CATEGORY_LABELS, getGlass, type Recipe } from "@bartender/core";
import GlassDiagram from "./GlassDiagram";

export default function CocktailCard({ recipe }: { recipe: Recipe }) {
  return (
    <Link to={`/cocktails/${recipe.id}`} className="card cocktail-card">
      <div className="card-diagram">
        <GlassDiagram recipe={recipe} animate={false} />
      </div>
      <div className="card-body">
        <h3>{recipe.name}</h3>
        <p className="muted small">
          {CATEGORY_LABELS[recipe.category]} · {getGlass(recipe.glass).name}
        </p>
        <p className="small ingredients-line">{recipe.ingredients.map((i) => i.name).join(" · ")}</p>
      </div>
    </Link>
  );
}
