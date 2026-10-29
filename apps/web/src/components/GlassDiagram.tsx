import { useMemo } from "react";
import { CENTER_X, computeDiagram, type IceShape, type Recipe } from "@bartender/core";

interface Props {
  recipe: Recipe;
  /** Ingredient id to emphasise (others fade). */
  highlight?: string | null;
  onHighlight?: (id: string | null) => void;
  /** Optional explicit width; by default the size comes from CSS. */
  width?: number | string;
  /** Animate the pour when the recipe changes. */
  animate?: boolean;
  className?: string;
}

const MATERIAL: Record<string, { fill: string; stroke: string }> = {
  glass: { fill: "var(--glass-fill)", stroke: "var(--glass-stroke)" },
  copper: { fill: "#c7793f", stroke: "#8a4b22" },
  silver: { fill: "#c9ccd1", stroke: "#7d8288" },
};

function Ice({ shape }: { shape: IceShape }) {
  const half = shape.size / 2;
  const common = { fill: "rgba(255,255,255,0.55)", stroke: "rgba(255,255,255,0.95)", strokeWidth: 1.2 };
  if (shape.kind === "sphere") return <circle cx={shape.x} cy={shape.y} r={half} {...common} />;
  return (
    <rect
      x={shape.x - half}
      y={shape.y - half}
      width={shape.size}
      height={shape.size}
      rx={shape.kind === "crushed" ? 2 : 4}
      transform={`rotate(${shape.rotation} ${shape.x} ${shape.y})`}
      {...common}
    />
  );
}

export default function GlassDiagram({ recipe, highlight, onHighlight, width, animate = true, className }: Props) {
  const d = useMemo(() => computeDiagram(recipe), [recipe]);
  const material = MATERIAL[d.glass.material ?? "glass"];
  const isMetal = d.glass.material && d.glass.material !== "glass";
  const clipId = `clip-${recipe.id}`;
  const interactive = Boolean(onHighlight);

  return (
    <svg
      viewBox={d.viewBox}
      width={width}
      className={`glass-diagram ${className ?? ""}`}
      role="img"
      aria-label={`${recipe.name} in a ${d.glass.name}: ${d.layers.map((l) => `${l.ingredient.name} ${Math.round(l.fraction * 100)}%`).join(", ")}`}
      style={{ aspectRatio: `${d.bounds.width} / ${d.bounds.height}` }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") onHighlight?.(null);
      }}
    >
      <defs>
        <clipPath id={clipId}>
          <polygon points={d.paths.bowlPoints} />
        </clipPath>
      </defs>

      <path d={d.paths.body} fill={material.fill} stroke={material.stroke} strokeWidth={2} strokeLinejoin="round" />
      {d.paths.stem && <path d={d.paths.stem} fill={material.fill} stroke={material.stroke} strokeWidth={2} />}
      {d.paths.foot && <path d={d.paths.foot} fill={material.fill} stroke={material.stroke} strokeWidth={2} />}
      {d.paths.handle && <path d={d.paths.handle} fill={material.fill} stroke={material.stroke} strokeWidth={2} />}

      <g clipPath={`url(#${clipId})`}>
        <g key={recipe.id} className={animate ? "pour" : undefined}>
          {d.layers.map((layer) => {
            const id = layer.ingredient.id;
            const dim = highlight && highlight !== id;
            const hot = highlight === id;
            return (
              <polygon
                key={id}
                points={layer.points}
                fill={layer.ingredient.color}
                fillOpacity={dim ? 0.35 : isMetal ? 1 : 0.9}
                stroke={hot ? "var(--ink)" : "rgba(255,255,255,0.7)"}
                strokeWidth={hot ? 1.6 : 1}
                className={`layer ${interactive ? "interactive" : ""}`}
                // Hover is mouse-only: a tap fires a synthetic mouseenter *and* a click,
                // which would select and immediately deselect the layer.
                onPointerEnter={(e) => {
                  if (e.pointerType === "mouse") onHighlight?.(id);
                }}
                // Keyboard focus only; a tap also focuses the element just before its click.
                onFocus={(e) => {
                  if (e.currentTarget.matches(":focus-visible")) onHighlight?.(id);
                }}
                onClick={() => onHighlight?.(hot ? null : id)}
                tabIndex={interactive ? 0 : undefined}
              >
                <title>
                  {layer.ingredient.name}: {Number(layer.ml.toFixed(1))} ml ({Math.round(layer.fraction * 100)}%)
                </title>
              </polygon>
            );
          })}
          {d.ice.map((shape, i) => (
            <Ice key={i} shape={shape} />
          ))}
        </g>
      </g>

      <path d={d.paths.bowl} fill="none" stroke={material.stroke} strokeWidth={1.5} strokeOpacity={0.7} />
      {!isMetal && <ellipse cx={CENTER_X} cy={d.paths.rimY} rx={d.paths.rimR + d.glass.wall} ry={4} fill="none" stroke={material.stroke} strokeWidth={1.5} strokeOpacity={0.6} />}

    </svg>
  );
}
