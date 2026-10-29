import { useMemo } from "react";
import { CENTER_X, computeDiagram, radiusAt, type DiagramLayer, type IceShape, type Ingredient, type Recipe } from "@bartender/core";

interface Props {
  recipe: Recipe;
  /** Ingredient id to emphasise (others fade). */
  highlight?: string | null;
  onHighlight?: (id: string | null) => void;
  /** Draw tappable colour handles beside the glass with a tooltip for the selected layer. */
  handles?: boolean;
  /** Formats the amount shown in the tooltip (defaults to millilitres). */
  formatAmount?: (ingredient: Ingredient) => string;
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

/** Minimum height of a layer's tap target, in viewBox units. */
const MIN_HIT = 14;
/** Vertical spacing between handles. */
const HANDLE_GAP = 17;
/** Extra width reserved to the right of the glass for handles and the tooltip. */
const HANDLE_GUTTER = 118;

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

/** Spread handle positions so they never overlap, keeping them close to their layers. */
function handlePositions(layers: DiagramLayer[], minY: number, maxY: number): Map<string, number> {
  const ordered = [...layers].sort((a, b) => a.labelY - b.labelY); // top of the glass first
  const ys = ordered.map((l) => l.labelY);
  for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + HANDLE_GAP);
  // If the stack ran past the bottom, push it back up.
  const overflow = ys[ys.length - 1] - maxY;
  if (overflow > 0) for (let i = 0; i < ys.length; i++) ys[i] -= overflow;
  for (let i = ys.length - 2; i >= 0; i--) ys[i] = Math.min(ys[i], ys[i + 1] - HANDLE_GAP);
  for (let i = 0; i < ys.length; i++) ys[i] = Math.max(ys[i], minY + i * HANDLE_GAP);
  return new Map(ordered.map((l, i) => [l.ingredient.id, ys[i]]));
}

export default function GlassDiagram({ recipe, highlight, onHighlight, handles, formatAmount, width, animate = true, className }: Props) {
  const d = useMemo(() => computeDiagram(recipe), [recipe]);
  const material = MATERIAL[d.glass.material ?? "glass"];
  const isMetal = d.glass.material && d.glass.material !== "glass";
  const clipId = `clip-${recipe.id}`;
  const interactive = Boolean(onHighlight);
  const showHandles = handles ?? interactive;

  const b = d.bounds;
  const vbWidth = b.width + (showHandles ? HANDLE_GUTTER : 0);
  const handleX = b.x + b.width + 12;
  const positions = useMemo(() => (showHandles ? handlePositions(d.layers, b.y + 10, b.y + b.height - 10) : new Map<string, number>()), [d, showHandles, b]);

  const select = (id: string) => onHighlight?.(highlight === id ? null : id);
  const selected = highlight ? d.layers.find((l) => l.ingredient.id === highlight) : undefined;

  // Thin layers get a taller invisible target; render thinnest last so they sit on top.
  const hitTargets = [...d.layers].sort((a, b2) => b2.yBottom - b2.yTop - (a.yBottom - a.yTop));

  return (
    <svg
      viewBox={`${b.x} ${b.y} ${vbWidth} ${b.height}`}
      width={width}
      className={`glass-diagram ${className ?? ""}`}
      role="img"
      aria-label={`${recipe.name} in a ${d.glass.name}: ${d.layers.map((l) => `${l.ingredient.name} ${Math.round(l.fraction * 100)}%`).join(", ")}`}
      style={{ aspectRatio: `${vbWidth} / ${b.height}` }}
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
                className="layer"
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

      {/* Invisible, generously sized tap targets, one per layer. */}
      {interactive &&
        hitTargets.map((layer) => {
          const id = layer.ingredient.id;
          const h = layer.yBottom - layer.yTop;
          const top = h >= MIN_HIT ? layer.yTop : layer.labelY - MIN_HIT / 2;
          const r = radiusAt(d.profile, layer.labelY) + d.glass.wall;
          return (
            <rect
              key={`hit-${id}`}
              x={CENTER_X - r}
              y={top}
              width={r * 2}
              height={Math.max(h, MIN_HIT)}
              fill="transparent"
              className="hit"
              tabIndex={0}
              aria-label={`${layer.ingredient.name}, ${Math.round(layer.fraction * 100)}%`}
              onPointerEnter={(e) => {
                if (e.pointerType === "mouse") onHighlight?.(id);
              }}
              onFocus={(e) => {
                if (e.currentTarget.matches(":focus-visible")) onHighlight?.(id);
              }}
              onClick={() => select(id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  select(id);
                }
              }}
            />
          );
        })}

      {/* Colour handles beside the glass, with a leader line to their layer. */}
      {showHandles &&
        d.layers.map((layer) => {
          const id = layer.ingredient.id;
          const hy = positions.get(id) ?? layer.labelY;
          const edgeX = CENTER_X + radiusAt(d.profile, layer.labelY) + d.glass.wall + 2;
          const hot = highlight === id;
          const dim = highlight && !hot;
          return (
            <g key={`handle-${id}`} className="handle" opacity={dim ? 0.45 : 1} onClick={() => select(id)}>
              <path d={`M ${edgeX} ${layer.labelY} L ${handleX - 10} ${layer.labelY} L ${handleX - 6} ${hy} L ${handleX} ${hy}`} fill="none" stroke="var(--muted)" strokeWidth={0.8} strokeOpacity={hot ? 1 : 0.6} />
              <circle cx={handleX + 6} cy={hy} r={12} fill="transparent" className="hit" />
              <circle cx={handleX + 6} cy={hy} r={5.5} fill={layer.ingredient.color} stroke={hot ? "var(--ink)" : "var(--glass-stroke)"} strokeWidth={hot ? 1.8 : 1} />
            </g>
          );
        })}

      {/* Tooltip for the selected layer. */}
      {showHandles && selected && (
        <Tooltip
          x={handleX + 16}
          y={positions.get(selected.ingredient.id) ?? selected.labelY}
          maxRight={b.x + vbWidth - 2}
          minY={b.y + 2}
          maxY={b.y + b.height - 2}
          name={selected.ingredient.name}
          detail={`${formatAmount ? formatAmount(selected.ingredient) : `${Number(selected.ml.toFixed(1))} ml`} · ${Math.round(selected.fraction * 100)}%`}
        />
      )}
    </svg>
  );
}

function Tooltip({ x, y, maxRight, minY, maxY, name, detail }: { x: number; y: number; maxRight: number; minY: number; maxY: number; name: string; detail: string }) {
  const fontSize = 8;
  const charW = fontSize * 0.55;
  const w = Math.min(maxRight - x, Math.max(name.length, detail.length) * charW + 12);
  const h = 24;
  const top = Math.min(Math.max(y - h / 2, minY), maxY - h);
  return (
    <g className="tooltip" pointerEvents="none">
      <rect x={x} y={top} width={w} height={h} rx={4} fill="var(--bg-elev)" stroke="var(--line)" strokeWidth={0.8} />
      <text x={x + 6} y={top + 10} fontSize={fontSize} fontWeight={600} fill="var(--ink)">
        {name}
      </text>
      <text x={x + 6} y={top + 19.5} fontSize={fontSize - 0.5} fill="var(--muted)">
        {detail}
      </text>
    </g>
  );
}
