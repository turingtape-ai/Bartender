import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CENTER_X,
  bandPolygon,
  computeDiagram,
  formatAmount,
  glassPaths,
  profileVolume,
  radiusAt,
  toMl,
  yForVolume,
  type Diagram,
  type GlassPaths,
  type IceShape,
  type Ingredient,
  type Method,
  type ProfilePoint,
  type Recipe,
} from "@bartender/core";

/**
 * "Watch it being made": a method-aware animation driven by one clock.
 * Every element's state is a pure function of elapsed time, so the scene
 * can be played, scrubbed, replayed and rendered at any instant.
 */

interface Props {
  recipe: Recipe;
}

/* ------------------------------------------------------------------ */
/* Timeline                                                            */
/* ------------------------------------------------------------------ */

const POUR_EACH = 1000;
const RINSE = 900;
const ICE = 1000;
const CAP = 500;
const AGITATE = 1800;
const MUDDLE = 1500;
const SWIZZLE = 1200;
const TILT = 800;
const STRAIN = 2200;
const RETURN = 700;
const GARNISH = 900;
const SETTLE = 900;
const HOLD = 1200;

interface Phase {
  key: string;
  start: number;
  end: number;
  caption: string;
}

type Vessel = "shaker" | "mixing-glass" | "blender" | null;

function vesselFor(method: Method): Vessel {
  switch (method) {
    case "shake":
      return "shaker";
    case "stir":
    case "throw":
      return "mixing-glass";
    case "blend":
      return "blender";
    default:
      return null;
  }
}

const VESSEL_NAME: Record<NonNullable<Vessel>, string> = { shaker: "shaker", "mixing-glass": "mixing glass", blender: "blender" };

const AGITATE_CAPTION: Record<NonNullable<Vessel>, string> = {
  shaker: "Shake hard until the shaker frosts over",
  "mixing-glass": "Stir until well chilled",
  blender: "Blend until smooth",
};

function listNames(items: Ingredient[]): string {
  const names = items.map((i) => i.name.toLowerCase());
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function buildPhases(recipe: Recipe, vessel: Vessel, liquids: Ingredient[], solids: Ingredient[], rinses: Ingredient[], garnish: GarnishSpec | null): Phase[] {
  const phases: Phase[] = [];
  let t = 0;
  const push = (key: string, dur: number, caption: string) => {
    phases.push({ key, start: t, end: t + dur, caption });
    t += dur;
  };
  const glassName = diagramGlassName(recipe);
  for (const r of rinses) push(`rinse-${r.id}`, RINSE, `Rinse the ${glassName} with ${r.name.toLowerCase()} and discard the excess`);
  const strainTarget = `Strain into the ${glassName}`;

  if (vessel) {
    for (const ing of liquids.filter((i) => i.amount.unit !== "top")) push(`pour-${ing.id}`, POUR_EACH, `Add ${formatAmount(ing.amount, "ml")} ${ing.name.toLowerCase()} to the ${VESSEL_NAME[vessel]}`);
    push("vessel-ice", ICE, `Fill the ${VESSEL_NAME[vessel]} with ice`);
    if (vessel !== "mixing-glass") push("cap", CAP, vessel === "shaker" ? "Cap it" : "Lid on");
    push("agitate", AGITATE, AGITATE_CAPTION[vessel]);
    if (recipe.ice !== "none") push("glass-ice", ICE * 0.8, `Fill the ${glassName} with ${recipe.ice === "crushed" ? "crushed ice" : "ice"}`);
    push("tilt", TILT, vessel === "blender" ? `Pour into the ${glassName}` : strainTarget);
    push("strain", STRAIN, vessel === "blender" ? `Pour into the ${glassName}` : strainTarget);
    push("return", RETURN, vessel === "blender" ? `Pour into the ${glassName}` : strainTarget);
    for (const ing of liquids.filter((i) => i.amount.unit === "top")) push(`pour-${ing.id}`, POUR_EACH, `Top up with ${ing.name.toLowerCase()}`);
  } else {
    if (recipe.method === "muddle" && solids.length) {
      push("solids", ICE * 0.7, `Add the ${listNames(solids)}`);
      push("muddle", MUDDLE, `Muddle gently to release the flavours`);
    }
    if (recipe.ice !== "none") push("glass-ice", ICE * 0.8, `Fill the ${glassName} with ${recipe.ice === "crushed" ? "crushed ice" : "ice"}`);
    for (const ing of liquids) {
      const top = ing.amount.unit === "top";
      push(`pour-${ing.id}`, POUR_EACH, top ? `Top up with ${ing.name.toLowerCase()}` : `Add ${formatAmount(ing.amount, "ml")} ${ing.name.toLowerCase()}`);
    }
    if (recipe.method === "swizzle") push("swizzle", SWIZZLE, "Swizzle until the glass frosts");
    else if (recipe.method !== "layer") push("stir-glass", SWIZZLE * 0.7, "Give it a gentle stir");
  }
  if (garnish) push("garnish", GARNISH, `Garnish: ${recipe.garnish.toLowerCase()}`);
  if (vessel) push("settle", SETTLE, `${recipe.name}. Cheers!`);
  push("hold", HOLD, `${recipe.name}. Cheers!`);
  return phases;
}

function diagramGlassName(recipe: Recipe): string {
  return computeDiagram(recipe).glass.name.toLowerCase();
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeOut = (x: number) => 1 - (1 - x) * (1 - x);
const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

function progress(phases: Phase[], key: string, t: number): number {
  const p = phases.find((x) => x.key === key);
  if (!p) return 0;
  return clamp01((t - p.start) / (p.end - p.start));
}

function hasPhase(phases: Phase[], key: string): boolean {
  return phases.some((p) => p.key === key);
}

/* ------------------------------------------------------------------ */
/* Scene geometry                                                      */
/* ------------------------------------------------------------------ */

const CX = CENTER_X;
const SCENE_W = 440;
const SCENE_H = 332;
const COUNTER_Y = 262;
const GLASS_CENTER_X = 300;
const GLASS_MAX_H = 178;

// Vessels share one local frame (centred on CX, lip at y=20) so they can be swapped freely.
const VESSELS: Record<NonNullable<Vessel>, ProfilePoint[]> = {
  shaker: [
    { y: 150, r: 28 },
    { y: 20, r: 36 },
  ],
  "mixing-glass": [
    { y: 150, r: 30 },
    { y: 20, r: 34 },
  ],
  blender: [
    { y: 150, r: 26 },
    { y: 20, r: 40 },
  ],
};
const LIP_Y = 20;
const VESSEL_FILL = 0.55;
const LIP_UPRIGHT = { x: 110, y: COUNTER_Y - (150 - LIP_Y) - 4 };
const POUR_ANGLE = 104;

function vesselBody(profile: ProfilePoint[]): string {
  const [b, top] = profile;
  const w = 3;
  return `M ${CX - top.r - w} ${top.y} L ${CX - b.r - w} ${b.y + 4} L ${CX + b.r + w} ${b.y + 4} L ${CX + top.r + w} ${top.y} Z`;
}

interface GlassPlacement {
  s: number;
  tx: number;
  ty: number;
  toScene: (x: number, y: number) => { x: number; y: number };
}

function placeGlass(paths: GlassPaths): GlassPlacement {
  const b = paths.bounds;
  const s = Math.min(1, GLASS_MAX_H / b.height);
  const tx = GLASS_CENTER_X - CX * s;
  const ty = COUNTER_Y - (b.y + b.height - 6) * s;
  return { s, tx, ty, toScene: (x, y) => ({ x: tx + s * x, y: ty + s * y }) };
}

const MATERIAL: Record<string, { fill: string; stroke: string }> = {
  glass: { fill: "var(--glass-fill)", stroke: "var(--glass-stroke)" },
  copper: { fill: "#c7793f", stroke: "#8a4b22" },
  silver: { fill: "#c9ccd1", stroke: "#7d8288" },
};

function mixColor(liquids: Ingredient[]): string {
  let r = 0;
  let g = 0;
  let b = 0;
  let total = 0;
  for (const ing of liquids) {
    const ml = toMl(ing.amount);
    const hex = ing.color.replace("#", "");
    r += parseInt(hex.slice(0, 2), 16) * ml;
    g += parseInt(hex.slice(2, 4), 16) * ml;
    b += parseInt(hex.slice(4, 6), 16) * ml;
    total += ml;
  }
  if (!total) return "#dfe9f2";
  const c = (v: number) => Math.round(v / total).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/* ------------------------------------------------------------------ */
/* Garnish                                                             */
/* ------------------------------------------------------------------ */

type GarnishKind = "cherry" | "olive" | "wheel" | "twist" | "wedge" | "mint" | "pineapple" | "cucumber" | "rim" | "dust" | "berry";
interface GarnishSpec {
  kind: GarnishKind;
  color: string;
  /** Where it comes to rest: sinks to the bottom, floats on the surface, or sits on the rim. */
  rest: "bottom" | "surface" | "rim";
}

function garnishSpec(text: string): GarnishSpec | null {
  const g = text.toLowerCase();
  if (!g || g === "none" || g.startsWith("no garnish")) return null;
  const citrus = g.includes("lime") ? "#9acd32" : g.includes("orange") ? "#f5a623" : g.includes("grapefruit") ? "#f7b6a0" : g.includes("lemon") ? "#f4e46a" : null;
  if (g.includes("rim")) return { kind: "rim", color: g.includes("salt") ? "#ffffff" : "#f6efe0", rest: "rim" };
  if (g.includes("cherry")) return { kind: "cherry", color: "#9b1b30", rest: "bottom" };
  if (g.includes("olive")) return { kind: "olive", color: "#6b8e23", rest: "bottom" };
  if (g.includes("mint") || g.includes("basil") || g.includes("sprig")) return { kind: "mint", color: "#3f9a5a", rest: "surface" };
  if (g.includes("pineapple")) return { kind: "pineapple", color: "#f2d247", rest: "rim" };
  if (g.includes("cucumber")) return { kind: "cucumber", color: "#8fcf8f", rest: "surface" };
  if (g.includes("nutmeg") || g.includes("cinnamon") || g.includes("cocoa") || g.includes("coffee bean") || g.includes("pepper")) return { kind: "dust", color: "#6b3e1e", rest: "surface" };
  if (g.includes("raspberr") || g.includes("blackberr") || g.includes("berr")) return { kind: "berry", color: "#b3163f", rest: "surface" };
  if (citrus) {
    if (g.includes("twist") || g.includes("zest") || g.includes("peel")) return { kind: "twist", color: citrus, rest: "rim" };
    if (g.includes("wedge")) return { kind: "wedge", color: citrus, rest: "rim" };
    return { kind: "wheel", color: citrus, rest: "rim" };
  }
  return null;
}

function Garnish({ spec, x, y, rimR, p }: { spec: GarnishSpec; x: number; y: number; rimR: number; p: number }) {
  if (p <= 0) return null;
  switch (spec.kind) {
    case "cherry":
      return (
        <g>
          <line x1={x + 2} y1={y - 6} x2={x + 9} y2={y - 22} stroke="#5a3a1a" strokeWidth={1.4} strokeLinecap="round" />
          <circle cx={x} cy={y} r={6} fill={spec.color} stroke="#5e0f1d" strokeWidth={1} />
          <circle cx={x - 2} cy={y - 2} r={1.5} fill="rgba(255,255,255,0.5)" />
        </g>
      );
    case "olive":
      return (
        <g>
          <line x1={x - 14} y1={y - 26} x2={x + 10} y2={y + 2} stroke="#8a8f99" strokeWidth={1.2} />
          <ellipse cx={x} cy={y} rx={6} ry={4.5} fill={spec.color} stroke="#3f5a14" strokeWidth={1} />
          <circle cx={x + 2} cy={y} r={1.5} fill="#b3163f" />
        </g>
      );
    case "wheel":
      return (
        <g transform={`translate(${x + rimR - 6} ${y}) rotate(-10)`}>
          <circle r={11} fill={spec.color} stroke="rgba(0,0,0,0.25)" strokeWidth={1} />
          <circle r={8.5} fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth={1.5} />
          {[0, 60, 120].map((a) => (
            <line key={a} x1={-8} y1={0} x2={8} y2={0} transform={`rotate(${a})`} stroke="rgba(255,255,255,0.7)" strokeWidth={1} />
          ))}
        </g>
      );
    case "wedge":
      return (
        <g transform={`translate(${x + rimR - 6} ${y - 4})`}>
          <path d="M 0 0 L 12 -10 A 14 14 0 0 1 12 10 Z" fill={spec.color} stroke="rgba(0,0,0,0.25)" strokeWidth={1} />
        </g>
      );
    case "twist":
      return <path d={`M ${x + rimR - 14} ${y - 2} c 6 -10 12 10 18 0 c 4 -8 10 6 14 -2`} fill="none" stroke={spec.color} strokeWidth={4} strokeLinecap="round" />;
    case "mint":
      return (
        <g transform={`translate(${x} ${y})`}>
          <line x1={0} y1={0} x2={0} y2={-26} stroke="#2f7a43" strokeWidth={1.5} />
          {[-14, -22, -8, -18].map((ly, i) => (
            <ellipse key={i} cx={i % 2 ? 7 : -7} cy={ly} rx={7} ry={3.5} transform={`rotate(${i % 2 ? -30 : 30} ${i % 2 ? 7 : -7} ${ly})`} fill={spec.color} stroke="#2f7a43" strokeWidth={0.8} />
          ))}
        </g>
      );
    case "pineapple":
      return (
        <g transform={`translate(${x + rimR - 8} ${y - 6})`}>
          <path d="M 0 0 L 14 -16 L 14 16 Z" fill={spec.color} stroke="#b8961e" strokeWidth={1} />
          <path d="M 14 -16 l 6 -4 l -2 6 l 6 -2 l -4 6" fill="none" stroke="#3f9a5a" strokeWidth={1.5} />
        </g>
      );
    case "cucumber":
      return <ellipse cx={x} cy={y} rx={12} ry={4} fill={spec.color} stroke="#4f8a4f" strokeWidth={1} />;
    case "berry":
      return (
        <g>
          <circle cx={x - 4} cy={y} r={4} fill={spec.color} />
          <circle cx={x + 4} cy={y - 1} r={4} fill={spec.color} />
        </g>
      );
    case "dust":
      return (
        <g fill={spec.color} opacity={0.8}>
          {[-10, -4, 3, 9, -7, 6].map((dx, i) => (
            <circle key={i} cx={x + dx} cy={y + (i % 2 ? 1.5 : -1)} r={1.2} />
          ))}
        </g>
      );
    case "rim":
      return (
        <g fill={spec.color} stroke="rgba(0,0,0,0.15)" strokeWidth={0.4}>
          {Array.from({ length: 14 }, (_, i) => (
            <circle key={i} cx={x - rimR + (2 * rimR * i) / 13} cy={y + (i % 2 ? 1 : -1)} r={1.6} />
          ))}
        </g>
      );
  }
}

/* ------------------------------------------------------------------ */
/* Clock                                                               */
/* ------------------------------------------------------------------ */

function useClock(duration: number) {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const startRef = useRef(0);
  const offsetRef = useRef(0);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    startRef.current = performance.now() - offsetRef.current;
    const tick = (now: number) => {
      const next = now - startRef.current;
      if (next >= duration) {
        setT(duration);
        offsetRef.current = duration;
        setPlaying(false);
        return;
      }
      setT(next);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, duration]);

  const play = useCallback(() => {
    if (offsetRef.current >= duration) offsetRef.current = 0;
    setPlaying(true);
  }, [duration]);
  const pause = useCallback(() => {
    offsetRef.current = t;
    setPlaying(false);
  }, [t]);
  const seek = useCallback((ms: number) => {
    offsetRef.current = ms;
    startRef.current = performance.now() - ms;
    setT(ms);
  }, []);
  const restart = useCallback(() => {
    offsetRef.current = 0;
    setT(0);
    setPlaying(true);
  }, []);

  return { t, playing, play, pause, seek, restart };
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function MakeAnimation({ recipe }: Props) {
  const diagram: Diagram = useMemo(() => computeDiagram(recipe), [recipe]);
  const vessel = vesselFor(recipe.method);
  const liquids = useMemo(() => diagram.layers.map((l) => l.ingredient), [diagram]);
  // For vessel methods, top-ups (soda, champagne...) go straight into the glass after straining.
  const vesselLiquids = useMemo(() => (vessel ? liquids.filter((i) => i.amount.unit !== "top") : liquids), [liquids, vessel]);
  const topperIds = useMemo(() => new Set(vessel ? liquids.filter((i) => i.amount.unit === "top").map((i) => i.id) : []), [liquids, vessel]);
  const rinses = recipe.ingredients.filter((i) => i.role === "rinse");
  const solids = recipe.ingredients.filter((i) => toMl(i.amount) <= 0);
  const garnish = useMemo(() => garnishSpec(recipe.garnish), [recipe.garnish]);
  const phases = useMemo(() => buildPhases(recipe, vessel, liquids, solids, rinses, garnish), [recipe, vessel, liquids, solids.length, rinses.length, garnish]); // eslint-disable-line react-hooks/exhaustive-deps
  const duration = phases[phases.length - 1].end;

  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const { t, playing, play, pause, seek, restart } = useClock(duration);
  const time = reduced && t === 0 ? duration : t;

  const paths = useMemo(() => glassPaths(diagram.glass), [diagram.glass]);
  const place = useMemo(() => placeGlass(paths), [paths]);
  const material = MATERIAL[diagram.glass.material ?? "glass"];
  const isMetal = diagram.glass.material && diagram.glass.material !== "glass";
  const mixed = useMemo(() => mixColor(vesselLiquids), [vesselLiquids]);
  const totalMl = vesselLiquids.reduce((sum, i) => sum + toMl(i.amount), 0) || diagram.totalMl;
  const profile = diagram.profile;
  const bottomY = profile[0].y;

  /* ---- vessel contents ---- */
  const vesselProfile = vessel ? VESSELS[vessel] : null;
  const vesselCapacity = vesselProfile ? profileVolume(vesselProfile) : 0;
  let pouredShare = 0;
  let activePour: { ing: Ingredient; p: number } | null = null;
  for (const ing of liquids) {
    const p = progress(phases, `pour-${ing.id}`, time);
    if (!topperIds.has(ing.id)) pouredShare += (toMl(ing.amount) / totalMl) * easeOut(p);
    if (p > 0 && p < 1) activePour = { ing, p };
  }
  const pouringTopper = Boolean(activePour && topperIds.has(activePour.ing.id));
  const pStrain = easeInOut(progress(phases, "strain", time));
  const pVesselIce = progress(phases, "vessel-ice", time);
  const pCap = easeInOut(progress(phases, "cap", time));
  const pAgitate = progress(phases, "agitate", time);
  const pTilt = easeInOut(progress(phases, "tilt", time));
  const pReturn = easeInOut(progress(phases, "return", time));
  const pGlassIce = progress(phases, "glass-ice", time);
  const pGarnish = easeOut(progress(phases, "garnish", time));
  const pSettle = easeInOut(progress(phases, "settle", time));
  const pMuddle = progress(phases, "muddle", time);
  const pSolids = easeOut(progress(phases, "solids", time));
  const pSwizzle = progress(phases, "swizzle", time);
  const pStirGlass = progress(phases, "stir-glass", time);
  const agitating = pAgitate > 0 && pAgitate < 1;

  const vesselLiquidShare = pouredShare * (1 - pStrain);
  const vesselLevelY = vesselProfile ? yForVolume(vesselProfile, vesselLiquidShare * VESSEL_FILL * vesselCapacity) : 0;

  // Vessel transform, anchored on its lip: upright on the counter → tilted over the glass.
  const rimScene = place.toScene(CX, paths.rimY);
  const lipPouring = { x: rimScene.x - 22 * place.s - 4, y: Math.max(64, rimScene.y - 26) };
  const tilt = pTilt * (1 - pReturn);
  const wobble = agitating && vessel === "shaker" ? Math.sin(time / 38) * 14 : 0;
  const lift = agitating && vessel === "shaker" ? Math.abs(Math.sin(time / 76)) * 10 : 0;
  const lipX = LIP_UPRIGHT.x + (lipPouring.x - LIP_UPRIGHT.x) * tilt + wobble * 0.3;
  const lipY = LIP_UPRIGHT.y + (lipPouring.y - LIP_UPRIGHT.y) * tilt - lift;
  const vesselAngle = tilt * POUR_ANGLE + wobble;
  const contentsOpacity = vessel === "mixing-glass" ? 1 - pTilt : 1 - clamp01(pAgitate * 3);

  /* ---- glass contents ---- */
  const topY = diagram.liquidTopY;
  const vesselLayers = diagram.layers.filter((l) => !topperIds.has(l.ingredient.id));
  const topperLayers = diagram.layers.filter((l) => topperIds.has(l.ingredient.id));
  const mixedTopY = vesselLayers.length ? vesselLayers[vesselLayers.length - 1].yTop : bottomY;
  let glassFillY = bottomY;
  if (vessel) {
    glassFillY = bottomY - (bottomY - mixedTopY) * pStrain;
    for (const l of topperLayers) {
      const p = easeOut(progress(phases, `pour-${l.ingredient.id}`, time));
      if (p > 0) glassFillY = l.yBottom - (l.yBottom - l.yTop) * p;
    }
  } else {
    let acc = 0;
    for (const l of diagram.layers) {
      const p = easeOut(progress(phases, `pour-${l.ingredient.id}`, time));
      acc = l.yBottom - (l.yBottom - l.yTop) * p;
      if (p < 1) break;
    }
    glassFillY = acc;
  }
  const glassFilling = vessel ? (pStrain > 0 && pStrain < 1) || pouringTopper : Boolean(activePour);
  const glassHasLiquid = glassFillY < bottomY - 0.01;
  const glassIceVisible = hasPhase(phases, "glass-ice") ? pGlassIce : 1;

  // Garnish resting place, in glass-local coordinates.
  const garnishRestY = garnish ? (garnish.rest === "bottom" ? bottomY - 9 : garnish.rest === "surface" ? topY - 2 : paths.rimY) : 0;
  const garnishY = paths.rimY - 34 + (garnishRestY - (paths.rimY - 34)) * pGarnish;

  const phase = phases.find((p) => time >= p.start && time < p.end) ?? phases[phases.length - 1];
  const activeRinse = rinses.find((r) => {
    const p = progress(phases, `rinse-${r.id}`, time);
    return p > 0 && p < 1;
  });

  const vesselStreamTarget = place.toScene(CX, glassFillY);

  return (
    <div className="make-animation">
      <svg viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} className="scene" role="img" aria-label={`Animation of making the ${recipe.name}`}>
        <defs>
          {vesselProfile && (
            <clipPath id="anim-vessel">
              <polygon points={bandPolygon(vesselProfile, vesselProfile[0].y, LIP_Y)} />
            </clipPath>
          )}
          <clipPath id="anim-glass">
            <polygon points={paths.bowlPoints} />
          </clipPath>
        </defs>

        <line x1={20} y1={COUNTER_Y} x2={SCENE_W - 20} y2={COUNTER_Y} stroke="var(--line)" strokeWidth={2} />

        {/* The serving glass */}
        <g transform={`translate(${place.tx} ${place.ty}) scale(${place.s})`}>
          <path d={paths.body} fill={material.fill} stroke={material.stroke} strokeWidth={2 / place.s} strokeLinejoin="round" />
          {paths.stem && <path d={paths.stem} fill={material.fill} stroke={material.stroke} strokeWidth={2 / place.s} />}
          {paths.foot && <path d={paths.foot} fill={material.fill} stroke={material.stroke} strokeWidth={2 / place.s} />}
          {paths.handle && <path d={paths.handle} fill={material.fill} stroke={material.stroke} strokeWidth={2 / place.s} />}
          <g clipPath="url(#anim-glass)">
            {activeRinse && <polygon points={paths.bowlPoints} fill={activeRinse.color} fillOpacity={0.6 * Math.sin(progress(phases, `rinse-${activeRinse.id}`, time) * Math.PI)} />}
            {vessel && glassHasLiquid && <polygon points={bandPolygon(profile, bottomY, Math.max(glassFillY, mixedTopY))} fill={mixed} fillOpacity={(isMetal ? 1 : 0.92) * (1 - pSettle)} />}
            {vessel &&
              pSettle > 0 &&
              vesselLayers.map((l) => <polygon key={l.ingredient.id} points={l.points} fill={l.ingredient.color} fillOpacity={(isMetal ? 1 : 0.9) * pSettle} stroke="rgba(255,255,255,0.7)" strokeWidth={pSettle} />)}
            {vessel &&
              topperLayers.map((l) => {
                const p = easeOut(progress(phases, `pour-${l.ingredient.id}`, time));
                if (p <= 0) return null;
                return <polygon key={l.ingredient.id} points={bandPolygon(profile, l.yBottom, l.yBottom - (l.yBottom - l.yTop) * p)} fill={l.ingredient.color} fillOpacity={isMetal ? 1 : 0.9} stroke="rgba(255,255,255,0.7)" strokeWidth={1} />;
              })}
            {!vessel &&
              diagram.layers.map((l) => {
                const p = easeOut(progress(phases, `pour-${l.ingredient.id}`, time));
                if (p <= 0) return null;
                return <polygon key={l.ingredient.id} points={bandPolygon(profile, l.yBottom, l.yBottom - (l.yBottom - l.yTop) * p)} fill={l.ingredient.color} fillOpacity={isMetal ? 1 : 0.9} stroke="rgba(255,255,255,0.7)" strokeWidth={1} />;
              })}
            {glassFilling && <ellipse cx={CX} cy={glassFillY} rx={radiusAt(profile, glassFillY)} ry={2.5} fill="rgba(255,255,255,0.5)" />}
            {/* Muddled solids */}
            {hasPhase(phases, "solids") &&
              pSolids > 0 &&
              solids.slice(0, 3).map((s, i) => {
                const rest = bottomY - 6 - i * 5;
                const y = paths.rimY - 30 + (rest - (paths.rimY - 30)) * easeOut(clamp01((pSolids - i * 0.2) / (1 - i * 0.2)));
                const x = CX + (i - 1) * 12;
                const green = s.category === "herb" || s.name.toLowerCase().includes("mint");
                return green ? (
                  <ellipse key={s.id} cx={x} cy={y} rx={7} ry={3.5} transform={`rotate(${i * 35 - 30} ${x} ${y})`} fill="#4fa86b" stroke="#2f7a43" strokeWidth={0.8} />
                ) : (
                  <rect key={s.id} x={x - 6} y={y - 5} width={12} height={10} rx={2} transform={`rotate(${i * 25 - 20} ${x} ${y})`} fill={s.color} stroke="rgba(0,0,0,0.2)" strokeWidth={0.8} />
                );
              })}
            {/* Ice in the glass */}
            {diagram.ice.map((shape: IceShape, i) => {
              const start = Math.min(0.6, i * 0.08);
              const p = easeOut(clamp01((glassIceVisible - start) / (1 - start)));
              if (p <= 0) return null;
              const dy = (paths.rimY - 60 - shape.y) * (1 - p);
              const half = shape.size / 2;
              const common = { fill: "rgba(255,255,255,0.55)", stroke: "rgba(255,255,255,0.95)", strokeWidth: 1.2 };
              if (shape.kind === "sphere") return <circle key={i} cx={shape.x} cy={shape.y + dy} r={half} {...common} />;
              return <rect key={i} x={shape.x - half} y={shape.y + dy - half} width={shape.size} height={shape.size} rx={shape.kind === "crushed" ? 2 : 4} transform={`rotate(${shape.rotation} ${shape.x} ${shape.y + dy})`} {...common} />;
            })}
            {garnish && garnish.rest !== "rim" && <Garnish spec={garnish} x={CX} y={garnishY} rimR={paths.rimR} p={pGarnish} />}
          </g>
          <path d={paths.bowl} fill="none" stroke={material.stroke} strokeWidth={1.5 / place.s} strokeOpacity={0.7} />
          {!isMetal && <ellipse cx={CX} cy={paths.rimY} rx={paths.rimR + diagram.glass.wall} ry={4} fill="none" stroke={material.stroke} strokeWidth={1.5 / place.s} strokeOpacity={0.6} />}
          {garnish && garnish.rest === "rim" && <Garnish spec={garnish} x={CX} y={garnish.kind === "rim" ? paths.rimY : garnishY} rimR={paths.rimR} p={pGarnish} />}
          {/* Muddler */}
          {pMuddle > 0 && pMuddle < 1 && (
            <g transform={`translate(${CX} ${paths.rimY - 70 + Math.abs(Math.sin(pMuddle * Math.PI * 3)) * 48})`}>
              <rect x={-5} y={0} width={10} height={90} rx={4} fill="#8b5a2b" stroke="#5a3a1a" strokeWidth={1} />
              <rect x={-8} y={84} width={16} height={10} rx={3} fill="#5a3a1a" />
            </g>
          )}
          {/* Swizzle stick or a quick stir in the glass */}
          {((pSwizzle > 0 && pSwizzle < 1) || (pStirGlass > 0 && pStirGlass < 1)) && (
            <g transform={`translate(${CX + Math.sin(time / 60) * 10} ${paths.rimY - 50})`}>
              <rect x={-2} y={0} width={4} height={bottomY - paths.rimY + 40} rx={2} fill="#c9ced6" stroke="#6f7a86" strokeWidth={1} transform={`skewX(${Math.sin(time / 60) * 8})`} />
              {pSwizzle > 0 && pSwizzle < 1 && <ellipse cx={0} cy={bottomY - paths.rimY + 34} rx={10 * Math.abs(Math.cos(time / 60))} ry={3} fill="#c9ced6" stroke="#6f7a86" strokeWidth={1} />}
            </g>
          )}
        </g>

        {/* Stream from the vessel into the glass */}
        {vessel && pStrain > 0 && pStrain < 1 && (
          <path
            d={`M ${lipPouring.x} ${lipPouring.y} Q ${rimScene.x - 8} ${rimScene.y - 8} ${vesselStreamTarget.x} ${vesselStreamTarget.y}`}
            fill="none"
            stroke={mixed}
            strokeWidth={4}
            strokeLinecap="round"
            opacity={0.9}
          />
        )}

        {/* Ingredient stream, into the vessel or straight into the glass */}
        {activePour && (
          <g>
            <rect
              x={(vessel && !pouringTopper ? LIP_UPRIGHT.x : GLASS_CENTER_X) - 2}
              y={-10}
              width={4}
              height={(vessel && !pouringTopper ? LIP_UPRIGHT.y - LIP_Y + vesselLevelY : place.toScene(CX, glassFillY).y) + 10}
              rx={2}
              fill={activePour.ing.color}
              stroke="rgba(0,0,0,0.1)"
              strokeWidth={0.6}
              opacity={Math.min(1, activePour.p * 6, (1 - activePour.p) * 6)}
            />
            <text x={(vessel && !pouringTopper ? LIP_UPRIGHT.x : GLASS_CENTER_X) + 14} y={22} fontSize={11} fontWeight={600} fill="var(--ink)" opacity={Math.min(1, activePour.p * 4)} textAnchor={vessel && !pouringTopper ? "start" : "end"} transform={vessel && !pouringTopper ? undefined : `translate(${-28} 0)`}>
              {activePour.ing.amount.unit === "top" ? "top up" : formatAmount(activePour.ing.amount, "ml")} {activePour.ing.name}
            </text>
          </g>
        )}

        {/* The vessel */}
        {vessel && vesselProfile && (
          <g transform={`translate(${lipX - CX} ${lipY - LIP_Y}) rotate(${vesselAngle} ${CX} ${LIP_Y})`} opacity={1 - pReturn}>
            <path
              d={vesselBody(vesselProfile)}
              fill={vessel === "mixing-glass" ? "var(--glass-fill)" : vessel === "blender" ? "rgba(220,228,236,0.55)" : "#d9dde3"}
              stroke={vessel === "mixing-glass" ? "var(--glass-stroke)" : "#6f7a86"}
              strokeWidth={2}
              strokeLinejoin="round"
            />
            <g clipPath="url(#anim-vessel)" opacity={contentsOpacity}>
              {vesselLiquidShare > 0 && pAgitate >= 1 && <polygon points={bandPolygon(vesselProfile, vesselProfile[0].y, vesselLevelY)} fill={mixed} fillOpacity={0.95} />}
              {vesselLiquidShare > 0 &&
                pAgitate < 1 &&
                (() => {
                  let acc = 0;
                  return vesselLiquids.map((ing) => {
                    const p = easeOut(progress(phases, `pour-${ing.id}`, time));
                    const share = (toMl(ing.amount) / totalMl) * p;
                    const y0 = yForVolume(vesselProfile, acc * VESSEL_FILL * vesselCapacity);
                    acc += share;
                    const y1 = yForVolume(vesselProfile, acc * VESSEL_FILL * vesselCapacity);
                    if (share <= 0) return null;
                    // While stirring or blending, the layers blur into the mixed colour.
                    const blend = vessel === "shaker" ? 0 : pAgitate;
                    return <polygon key={ing.id} points={bandPolygon(vesselProfile, y0, y1)} fill={blend > 0.5 ? mixed : ing.color} fillOpacity={0.95} />;
                  });
                })()}
              {pVesselIce > 0 &&
                [0, 1, 2, 3].map((i) => {
                  const start = i * 0.18;
                  const p = easeOut(clamp01((pVesselIce - start) / (1 - start)));
                  if (p <= 0) return null;
                  const restY = vesselLevelY - 4 - (i % 2) * 20 - Math.floor(i / 2) * 2;
                  const y = -40 + (restY + 40) * p;
                  const x = CX + (i % 2 === 0 ? -12 : 12) + (i >= 2 ? 4 : -4);
                  return <rect key={i} x={x - 10} y={y - 10} width={20} height={20} rx={4} transform={`rotate(${((i * 23) % 40) - 20} ${x} ${y})`} fill="rgba(255,255,255,0.6)" stroke="rgba(255,255,255,0.95)" strokeWidth={1.2} />;
                })}
              {/* Blender vortex */}
              {vessel === "blender" && agitating && (
                <g opacity={0.6}>
                  {[0, 1, 2].map((i) => (
                    <ellipse key={i} cx={CX} cy={vesselLevelY + 30 + i * 22} rx={20 - i * 4} ry={5} fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth={1.5} transform={`rotate(${(time / 4 + i * 40) % 360} ${CX} ${vesselLevelY + 30 + i * 22})`} />
                  ))}
                </g>
              )}
            </g>
            <ellipse cx={CX} cy={LIP_Y} rx={vesselProfile[1].r + 3} ry={4} fill="none" stroke={vessel === "mixing-glass" ? "var(--glass-stroke)" : "#6f7a86"} strokeWidth={2} />
            {/* Cap or lid */}
            {vessel !== "mixing-glass" && (
              <g transform={`translate(0 ${-34 * (1 - pCap)})`} opacity={pCap > 0 || pVesselIce >= 1 ? 1 : 0}>
                {vessel === "shaker" ? (
                  <>
                    <path d={`M ${CX - vesselProfile[1].r - 3} ${LIP_Y} L ${CX - vesselProfile[1].r + 6} ${LIP_Y - 18} L ${CX + vesselProfile[1].r - 6} ${LIP_Y - 18} L ${CX + vesselProfile[1].r + 3} ${LIP_Y} Z`} fill="#c9ced6" stroke="#6f7a86" strokeWidth={2} strokeLinejoin="round" />
                    <rect x={CX - 10} y={LIP_Y - 28} width={20} height={11} rx={3} fill="#c9ced6" stroke="#6f7a86" strokeWidth={2} />
                  </>
                ) : (
                  <rect x={CX - vesselProfile[1].r - 4} y={LIP_Y - 10} width={vesselProfile[1].r * 2 + 8} height={10} rx={3} fill="#3a3f47" stroke="#22262b" strokeWidth={1.5} />
                )}
              </g>
            )}
            {/* Bar spoon going round the mixing glass */}
            {vessel === "mixing-glass" && agitating && (
              <g transform={`translate(${CX + Math.cos(time / 90) * 14} ${LIP_Y - 60}) rotate(${Math.sin(time / 90) * 12} 0 60)`}>
                <rect x={-1.5} y={0} width={3} height={180} rx={1.5} fill="#c9ced6" stroke="#6f7a86" strokeWidth={0.8} />
                <ellipse cx={0} cy={182} rx={5} ry={7} fill="#c9ced6" stroke="#6f7a86" strokeWidth={0.8} />
              </g>
            )}
            {vessel === "shaker" && pAgitate > 0.3 && pAgitate < 1 && <path d={vesselBody(vesselProfile)} fill="rgba(255,255,255,0.45)" stroke="none" />}
          </g>
        )}

        {/* Motion lines while shaking */}
        {vessel === "shaker" && agitating && (
          <g stroke="var(--muted)" strokeWidth={1.5} strokeLinecap="round" opacity={0.7}>
            <line x1={LIP_UPRIGHT.x - 62} y1={LIP_UPRIGHT.y + 40} x2={LIP_UPRIGHT.x - 50} y2={LIP_UPRIGHT.y + 40} />
            <line x1={LIP_UPRIGHT.x - 66} y1={LIP_UPRIGHT.y + 60} x2={LIP_UPRIGHT.x - 52} y2={LIP_UPRIGHT.y + 60} />
            <line x1={LIP_UPRIGHT.x + 50} y1={LIP_UPRIGHT.y + 50} x2={LIP_UPRIGHT.x + 62} y2={LIP_UPRIGHT.y + 50} />
            <line x1={LIP_UPRIGHT.x + 52} y1={LIP_UPRIGHT.y + 70} x2={LIP_UPRIGHT.x + 66} y2={LIP_UPRIGHT.y + 70} />
          </g>
        )}
      </svg>

      <p className="caption" aria-live="polite">
        {phase.caption}
      </p>
      <div className="controls">
        <button type="button" className="button" onClick={playing ? pause : t >= duration ? restart : play}>
          {playing ? "Pause" : t >= duration ? "Replay" : t > 0 ? "Resume" : "Play"}
        </button>
        <input type="range" min={0} max={duration} value={time} onChange={(e) => seek(Number(e.target.value))} aria-label="Scrub the animation" />
        <span className="muted small">
          {(time / 1000).toFixed(1)}s / {(duration / 1000).toFixed(0)}s
        </span>
      </div>
    </div>
  );
}
