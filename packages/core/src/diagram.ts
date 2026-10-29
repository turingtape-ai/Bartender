import { glassProfile, GLASSES, profileVolume, radiusAt, yForVolume, type GlassSpec, type ProfilePoint } from "./glasses.js";
import type { IceStyle, Ingredient, Method, Recipe } from "./schema.js";
import { toMl } from "./units.js";

export const VIEWBOX = { width: 200, height: 300 } as const;
export const CENTER_X = 100;

/** Extra water the drink picks up from ice while being made. */
const DILUTION: Record<Method, number> = {
  shake: 0.25,
  stir: 0.2,
  build: 0,
  blend: 0.3,
  muddle: 0.05,
  layer: 0,
  swizzle: 0.15,
  throw: 0.2,
};

/** Share of the glass taken up by ice, by style. */
const ICE_SHARE: Record<IceStyle, number> = {
  none: 0,
  cubes: 0.32,
  crushed: 0.45,
  "large-cube": 0.22,
  sphere: 0.22,
};

/** A neat pour in a tumbler should look like one, so the floor is low; the ceiling avoids overflowing rims. */
const MIN_FILL = 0.2;
const MAX_FILL = 0.9;

export interface DiagramLayer {
  ingredient: Ingredient;
  /** Millilitres in the recipe (0 for non-liquid items). */
  ml: number;
  /** Share of the total liquid volume, 0..1. */
  fraction: number;
  /** y coordinates in viewBox space (yTop < yBottom). */
  yTop: number;
  yBottom: number;
  /** Closed polygon following the inner glass wall, as SVG `points`. */
  points: string;
  /** Label anchor (centre of the layer). */
  labelY: number;
}

export interface IceShape {
  kind: "cube" | "crushed" | "sphere";
  x: number;
  y: number;
  size: number;
  rotation: number;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Diagram {
  glass: GlassSpec;
  profile: ProfilePoint[];
  /** Tight viewBox around the glass, so short tumblers are not dwarfed by empty space. */
  viewBox: string;
  bounds: Bounds;
  layers: DiagramLayer[];
  /** Ingredients that do not contribute volume (garnish-like, pieces). */
  solids: Ingredient[];
  totalMl: number;
  liquidTopY: number;
  ice: IceShape[];
  /** SVG path data for the glass. */
  paths: GlassPaths;
}

export interface GlassPaths {
  /** Outer silhouette including the base. */
  body: string;
  /** Inner bowl outline (open at the rim). */
  bowl: string;
  /** Inner bowl polygon points, for clipping. */
  bowlPoints: string;
  stem?: string;
  foot?: string;
  handle?: string;
  rimY: number;
  rimR: number;
  /** Bounding box of everything drawn, with a little padding. */
  bounds: Bounds;
}

/* ------------------------------------------------------------------ */

function fmt(n: number): string {
  return Number(n.toFixed(2)).toString();
}

/** Points along the inner wall between two heights, from yBottom up to yTop, on the given side. */
function wallPoints(profile: ProfilePoint[], yBottom: number, yTop: number, side: -1 | 1): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  pts.push([CENTER_X + side * radiusAt(profile, yBottom), yBottom]);
  for (const p of profile) {
    if (p.y < yBottom && p.y > yTop) pts.push([CENTER_X + side * p.r, p.y]);
  }
  pts.push([CENTER_X + side * radiusAt(profile, yTop), yTop]);
  return pts;
}

/** Polygon (SVG `points`) of the liquid between two heights, following the inner wall. */
export function bandPolygon(profile: ProfilePoint[], yBottom: number, yTop: number): string {
  const left = wallPoints(profile, yBottom, yTop, -1);
  const right = wallPoints(profile, yBottom, yTop, 1).reverse();
  return [...left, ...right].map(([x, y]) => `${fmt(x)},${fmt(y)}`).join(" ");
}

export function glassPaths(spec: GlassSpec): GlassPaths {
  const profile = glassProfile(spec);
  const bottom = profile[0];
  const rim = profile[profile.length - 1];

  // Inner bowl: rim-left → bottom → rim-right (open at the top).
  const leftDown = [...profile].reverse().map((p) => `${fmt(CENTER_X - p.r)},${fmt(p.y)}`);
  const rightUp = profile.map((p) => `${fmt(CENTER_X + p.r)},${fmt(p.y)}`);
  const bowl = `M ${leftDown.join(" L ")} L ${rightUp.join(" L ")}`;
  const bowlPoints = [...leftDown, ...rightUp].join(" ");

  // Outer silhouette: offset by wall thickness, plus the base.
  const outer = profile.map((p) => ({ y: p.y, r: p.r + spec.wall }));
  const baseY = bottom.y + spec.base + spec.wall;
  const outerLeft = [...outer].reverse().map((p) => `${fmt(CENTER_X - p.r)},${fmt(p.y)}`);
  const outerRight = outer.map((p) => `${fmt(CENTER_X + p.r)},${fmt(p.y)}`);
  const baseHalf = Math.max(bottom.r + spec.wall, spec.stem ? spec.stem.width / 2 + 4 : 0);
  const body = `M ${outerLeft.join(" L ")} L ${fmt(CENTER_X - baseHalf)},${fmt(baseY)} L ${fmt(CENTER_X + baseHalf)},${fmt(baseY)} L ${outerRight.join(" L ")} Z`;

  let stem: string | undefined;
  let foot: string | undefined;
  if (spec.stem && spec.foot) {
    const w = spec.stem.width / 2;
    const footTop = spec.stem.toY;
    stem = `M ${fmt(CENTER_X - w)},${fmt(baseY - 1)} L ${fmt(CENTER_X + w)},${fmt(baseY - 1)} L ${fmt(CENTER_X + w)},${fmt(footTop)} L ${fmt(CENTER_X - w)},${fmt(footTop)} Z`;
    const fr = spec.foot.r;
    const fh = spec.foot.height;
    foot = `M ${fmt(CENTER_X - w - 2)},${fmt(footTop - 2)} C ${fmt(CENTER_X - fr * 0.6)},${fmt(footTop + 1)} ${fmt(CENTER_X - fr)},${fmt(footTop + fh * 0.4)} ${fmt(CENTER_X - fr)},${fmt(footTop + fh)} L ${fmt(CENTER_X + fr)},${fmt(footTop + fh)} C ${fmt(CENTER_X + fr)},${fmt(footTop + fh * 0.4)} ${fmt(CENTER_X + fr * 0.6)},${fmt(footTop + 1)} ${fmt(CENTER_X + w + 2)},${fmt(footTop - 2)} Z`;
  }

  let handle: string | undefined;
  if (spec.handle) {
    const h = spec.handle;
    const xTop = CENTER_X + radiusAt(profile, h.top) + spec.wall;
    const xBottom = CENTER_X + radiusAt(profile, h.bottom) + spec.wall;
    const reach = Math.max(xTop, xBottom) + h.reach;
    handle = `M ${fmt(xTop)},${fmt(h.top)} C ${fmt(reach + 8)},${fmt(h.top)} ${fmt(reach + 8)},${fmt(h.bottom)} ${fmt(xBottom)},${fmt(h.bottom)} L ${fmt(xBottom)},${fmt(h.bottom - 10)} C ${fmt(reach - 4)},${fmt(h.bottom - 12)} ${fmt(reach - 4)},${fmt(h.top + 12)} ${fmt(xTop)},${fmt(h.top + 10)} Z`;
  }

  const pad = 6;
  const maxR = Math.max(...outer.map((p) => p.r), spec.foot?.r ?? 0, baseHalf);
  const right = spec.handle ? maxR + spec.handle.reach + 12 : maxR;
  const lowest = spec.stem && spec.foot ? spec.stem.toY + spec.foot.height : baseY;
  const bounds: Bounds = {
    x: CENTER_X - maxR - pad,
    y: rim.y - pad,
    width: maxR + right + pad * 2,
    height: lowest - rim.y + pad * 2,
  };

  return { body, bowl, bowlPoints, stem, foot, handle, rimY: rim.y, rimR: rim.r, bounds };
}

/* ------------------------------------------------------------------ */

function iceShapes(style: IceStyle, profile: ProfilePoint[], liquidTopY: number, bottomY: number): IceShape[] {
  if (style === "none") return [];
  const span = bottomY - liquidTopY;
  if (span <= 0) return [];
  const shapes: IceShape[] = [];
  const place = (fy: number, fx: number, size: number, rotation: number, kind: IceShape["kind"]) => {
    const y = liquidTopY + span * fy;
    const r = radiusAt(profile, y) - size * 0.6;
    shapes.push({ kind, x: CENTER_X + fx * Math.max(0, r), y, size, rotation });
  };
  switch (style) {
    case "large-cube": {
      const size = Math.min(span * 0.78, radiusAt(profile, bottomY - span * 0.5) * 1.5);
      place(0.5, 0, size, -6, "cube");
      break;
    }
    case "sphere": {
      const size = Math.min(span * 0.8, radiusAt(profile, bottomY - span * 0.5) * 1.5);
      place(0.5, 0, size, 0, "sphere");
      break;
    }
    case "cubes": {
      const size = Math.min(34, Math.max(18, span * 0.2));
      const rows = Math.max(1, Math.floor(span / (size * 0.95)));
      for (let i = 0; i < rows; i++) {
        const fy = rows === 1 ? 0.5 : 0.12 + (0.78 * i) / (rows - 1);
        place(fy, i % 2 === 0 ? -0.55 : 0.55, size, i % 2 === 0 ? -14 : 11, "cube");
        if (radiusAt(profile, liquidTopY + span * fy) > size * 1.2) {
          place(fy + 0.04, i % 2 === 0 ? 0.5 : -0.5, size * 0.9, i % 2 === 0 ? 17 : -9, "cube");
        }
      }
      break;
    }
    case "crushed": {
      const size = 7;
      const rows = Math.max(2, Math.floor(span / (size * 1.6)));
      for (let i = 0; i < rows; i++) {
        const fy = 0.08 + (0.84 * i) / Math.max(1, rows - 1);
        const cols = Math.max(2, Math.floor((radiusAt(profile, liquidTopY + span * fy) * 2) / (size * 2.2)));
        for (let c = 0; c < cols; c++) {
          const fx = cols === 1 ? 0 : -0.85 + (1.7 * c) / (cols - 1) + (i % 2 ? 0.12 : -0.12);
          place(fy, fx, size * (0.75 + ((i * 7 + c * 3) % 5) / 10), (i * 29 + c * 13) % 90, "crushed");
        }
      }
      break;
    }
  }
  return shapes;
}

/**
 * Compute the level diagram for a recipe: each liquid ingredient becomes a
 * band whose *volume* (not height) is proportional to its share of the drink,
 * so a wide coupe and a narrow flute both read correctly.
 */
export function computeDiagram(recipe: Recipe): Diagram {
  const glass = GLASSES[recipe.glass];
  const profile = glassProfile(glass);
  const bottomY = profile[0].y;
  const capacityUnits = profileVolume(profile);
  const unitsPerMl = capacityUnits / glass.capacityMl;

  const pours = (i: Ingredient) => toMl(i.amount) > 0 && i.role !== "rinse";
  const liquids = recipe.ingredients.filter(pours);
  const solids = recipe.ingredients.filter((i) => !pours(i));
  const totalMl = liquids.reduce((s, i) => s + toMl(i.amount), 0);

  // Where the surface sits: drink + dilution + ice, clamped to a plausible pour.
  const iceMl = ICE_SHARE[recipe.ice] * glass.capacityMl;
  const pouredMl = totalMl * (1 + DILUTION[recipe.method]) + iceMl;
  const fillMl = Math.min(glass.capacityMl * MAX_FILL, Math.max(glass.capacityMl * MIN_FILL, pouredMl));

  const layers: DiagramLayer[] = [];
  let accMl = 0;
  for (const ingredient of liquids) {
    const ml = toMl(ingredient.amount);
    const fraction = totalMl > 0 ? ml / totalMl : 0;
    const fromMl = (accMl / totalMl) * fillMl;
    const toMlLevel = ((accMl + ml) / totalMl) * fillMl;
    const yBottom = yForVolume(profile, fromMl * unitsPerMl);
    const yTop = yForVolume(profile, toMlLevel * unitsPerMl);
    layers.push({
      ingredient,
      ml,
      fraction,
      yTop,
      yBottom,
      points: bandPolygon(profile, yBottom, yTop),
      labelY: (yTop + yBottom) / 2,
    });
    accMl += ml;
  }
  const liquidTopY = layers.length ? layers[layers.length - 1].yTop : bottomY;
  const paths = glassPaths(glass);
  const b = paths.bounds;

  return {
    glass,
    profile,
    viewBox: `${fmt(b.x)} ${fmt(b.y)} ${fmt(b.width)} ${fmt(b.height)}`,
    bounds: b,
    layers,
    solids,
    totalMl,
    liquidTopY,
    ice: iceShapes(recipe.ice, profile, liquidTopY, bottomY),
    paths,
  };
}

/* ------------------------------------------------------------------ */
/* Standalone SVG rendering (used by the API and the MCP server)       */
/* ------------------------------------------------------------------ */

export interface SvgOptions {
  /** Draw ingredient labels beside the glass. */
  labels?: boolean;
  /** Width in px; height follows the 2:3 viewBox. */
  width?: number;
  /** Background colour or "none". */
  background?: string;
  /** Text colour for labels. */
  textColor?: string;
}

const MATERIAL_FILL: Record<NonNullable<GlassSpec["material"]>, { fill: string; stroke: string }> = {
  glass: { fill: "rgba(200,220,235,0.18)", stroke: "#8fa6b8" },
  copper: { fill: "#c7793f", stroke: "#8a4b22" },
  silver: { fill: "#c9ccd1", stroke: "#7d8288" },
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function iceSvg(shape: IceShape): string {
  const half = shape.size / 2;
  const common = `fill="rgba(255,255,255,0.55)" stroke="rgba(255,255,255,0.9)" stroke-width="1.2"`;
  if (shape.kind === "sphere") {
    return `<circle cx="${fmt(shape.x)}" cy="${fmt(shape.y)}" r="${fmt(half)}" ${common}/>`;
  }
  if (shape.kind === "crushed") {
    return `<rect x="${fmt(shape.x - half)}" y="${fmt(shape.y - half)}" width="${fmt(shape.size)}" height="${fmt(shape.size)}" rx="2" transform="rotate(${shape.rotation} ${fmt(shape.x)} ${fmt(shape.y)})" ${common}/>`;
  }
  return `<rect x="${fmt(shape.x - half)}" y="${fmt(shape.y - half)}" width="${fmt(shape.size)}" height="${fmt(shape.size)}" rx="4" transform="rotate(${shape.rotation} ${fmt(shape.x)} ${fmt(shape.y)})" ${common}/>`;
}

/** Render a diagram as a standalone SVG string. */
export function diagramToSvg(diagram: Diagram, opts: SvgOptions = {}): string {
  const labels = opts.labels ?? true;
  const width = opts.width ?? (labels ? 420 : 240);
  const textColor = opts.textColor ?? "#1f2937";
  const material = MATERIAL_FILL[diagram.glass.material ?? "glass"];
  const isMetal = diagram.glass.material && diagram.glass.material !== "glass";
  const b = diagram.bounds;
  const labelWidth = labels ? 150 : 0;
  const vbW = b.width + labelWidth;
  const vbH = Math.max(b.height, labels ? diagram.layers.length * 14 + 20 : 0);
  const height = Math.round((width * vbH) / vbW);
  const clipId = `bowl-${diagram.glass.id}`;

  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${fmt(b.x)} ${fmt(b.y)} ${fmt(vbW)} ${fmt(vbH)}" width="${width}" height="${height}" role="img" aria-label="Glass diagram">`);
  if (opts.background && opts.background !== "none") {
    parts.push(`<rect x="${fmt(b.x)}" y="${fmt(b.y)}" width="${fmt(vbW)}" height="${fmt(vbH)}" fill="${esc(opts.background)}"/>`);
  }
  parts.push(`<defs><clipPath id="${clipId}"><polygon points="${diagram.paths.bowlPoints}"/></clipPath></defs>`);

  // Glass body behind the liquid.
  parts.push(`<path d="${diagram.paths.body}" fill="${material.fill}" stroke="${material.stroke}" stroke-width="2" stroke-linejoin="round"/>`);
  if (diagram.paths.stem) parts.push(`<path d="${diagram.paths.stem}" fill="${material.fill}" stroke="${material.stroke}" stroke-width="2"/>`);
  if (diagram.paths.foot) parts.push(`<path d="${diagram.paths.foot}" fill="${material.fill}" stroke="${material.stroke}" stroke-width="2"/>`);
  if (diagram.paths.handle) parts.push(`<path d="${diagram.paths.handle}" fill="${material.fill}" stroke="${material.stroke}" stroke-width="2"/>`);

  // Liquid layers, clipped to the bowl.
  parts.push(`<g clip-path="url(#${clipId})">`);
  for (const layer of diagram.layers) {
    parts.push(`<polygon points="${layer.points}" fill="${layer.ingredient.color}" fill-opacity="${isMetal ? 1 : 0.88}"><title>${esc(layer.ingredient.name)}: ${fmt(layer.ml)} ml (${Math.round(layer.fraction * 100)}%)</title></polygon>`);
  }
  for (const layer of diagram.layers) {
    parts.push(`<line x1="${fmt(CENTER_X - radiusAt(diagram.profile, layer.yTop))}" y1="${fmt(layer.yTop)}" x2="${fmt(CENTER_X + radiusAt(diagram.profile, layer.yTop))}" y2="${fmt(layer.yTop)}" stroke="rgba(255,255,255,0.7)" stroke-width="1"/>`);
  }
  for (const ice of diagram.ice) parts.push(iceSvg(ice));
  parts.push(`</g>`);

  // Inner bowl edge and a highlight.
  parts.push(`<path d="${diagram.paths.bowl}" fill="none" stroke="${material.stroke}" stroke-width="1.5" stroke-opacity="0.7"/>`);
  if (!isMetal) {
    const rimY = diagram.paths.rimY;
    parts.push(`<ellipse cx="${CENTER_X}" cy="${fmt(rimY)}" rx="${fmt(diagram.paths.rimR + diagram.glass.wall)}" ry="4" fill="none" stroke="${material.stroke}" stroke-width="1.5" stroke-opacity="0.6"/>`);
  }

  if (labels) {
    const x0 = b.x + b.width + 4;
    const minGap = 14;
    let lastY = b.y + 4;
    const placed = [...diagram.layers].reverse().map((layer) => {
      let y = Math.max(layer.labelY, lastY + minGap);
      lastY = y;
      return { layer, y };
    });
    for (const { layer, y } of placed) {
      const xEdge = CENTER_X + radiusAt(diagram.profile, layer.labelY) + diagram.glass.wall + 2;
      parts.push(`<path d="M ${fmt(xEdge)},${fmt(layer.labelY)} L ${fmt(x0)},${fmt(y)}" stroke="${textColor}" stroke-opacity="0.45" stroke-width="1" fill="none"/>`);
      parts.push(`<rect x="${fmt(x0 + 2)}" y="${fmt(y - 5)}" width="10" height="10" rx="2" fill="${layer.ingredient.color}"/>`);
      parts.push(`<text x="${fmt(x0 + 16)}" y="${fmt(y + 4)}" font-family="system-ui, sans-serif" font-size="10" fill="${textColor}">${esc(layer.ingredient.name)} · ${fmt(layer.ml)} ml</text>`);
    }
  }

  parts.push(`</svg>`);
  return parts.join("");
}

/** Render just the empty glass (for the glass gallery). */
export function glassToSvg(spec: GlassSpec, opts: { width?: number; height?: number } = {}): string {
  const paths = glassPaths(spec);
  const material = MATERIAL_FILL[spec.material ?? "glass"];
  const b = paths.bounds;
  const height = opts.height ?? 160;
  const width = opts.width ?? Math.round((height * b.width) / b.height);
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${fmt(b.x)} ${fmt(b.y)} ${fmt(b.width)} ${fmt(b.height)}" width="${width}" height="${opts.width ? Math.round((width * b.height) / b.width) : height}" role="img" aria-label="${esc(spec.name)}">`,
    `<path d="${paths.body}" fill="${material.fill}" stroke="${material.stroke}" stroke-width="2" stroke-linejoin="round"/>`,
  ];
  if (paths.stem) parts.push(`<path d="${paths.stem}" fill="${material.fill}" stroke="${material.stroke}" stroke-width="2"/>`);
  if (paths.foot) parts.push(`<path d="${paths.foot}" fill="${material.fill}" stroke="${material.stroke}" stroke-width="2"/>`);
  if (paths.handle) parts.push(`<path d="${paths.handle}" fill="${material.fill}" stroke="${material.stroke}" stroke-width="2"/>`);
  parts.push(`<path d="${paths.bowl}" fill="none" stroke="${material.stroke}" stroke-width="1.5" stroke-opacity="0.7"/>`);
  parts.push(`</svg>`);
  return parts.join("");
}
