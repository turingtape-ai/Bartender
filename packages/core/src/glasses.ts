import type { GlassId } from "./schema.js";

/**
 * A point on the inside profile of a glass, in SVG coordinates
 * (viewBox 0 0 200 300, y grows downward, the glass is centred on x = 100).
 * `r` is the inner radius at height `y`.
 */
export interface ProfilePoint {
  y: number;
  r: number;
}

export interface GlassSpec {
  id: GlassId;
  name: string;
  /** Short description shown in the glass gallery. */
  description: string;
  /** Realistic capacity, used to place the liquid level. */
  capacityMl: number;
  /** Inner profile from the bottom of the bowl (largest y) to the rim (smallest y). */
  bowl: ProfilePoint[];
  /** Glass wall thickness in viewBox units. */
  wall: number;
  /** Extra glass under the bowl (thick tumbler bases). */
  base: number;
  /** Stem for footed glasses. */
  stem?: { toY: number; width: number };
  /** Foot for footed glasses. */
  foot?: { r: number; height: number };
  /** Handle for mugs (drawn on the right hand side). */
  handle?: { top: number; bottom: number; reach: number };
  /** Material tint for metal vessels. */
  material?: "glass" | "copper" | "silver";
  /** Whether the profile should be smoothed with a spline. */
  smooth?: boolean;
}

/* ------------------------------------------------------------------ */
/* Profile helpers                                                     */
/* ------------------------------------------------------------------ */

/** Catmull-Rom interpolation of r(y), producing a dense profile for curved bowls. */
function smoothProfile(points: ProfilePoint[], segments = 6): ProfilePoint[] {
  if (points.length < 3) return points;
  const out: ProfilePoint[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    for (let s = 0; s < segments; s++) {
      const t = s / segments;
      const t2 = t * t;
      const t3 = t2 * t;
      const y = 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
      const r = 0.5 * (2 * p1.r + (-p0.r + p2.r) * t + (2 * p0.r - 5 * p1.r + 4 * p2.r - p3.r) * t2 + (-p0.r + 3 * p1.r - 3 * p2.r + p3.r) * t3);
      out.push({ y, r: Math.max(0, r) });
    }
  }
  out.push(points[points.length - 1]);
  // Ensure y is strictly decreasing from bottom to rim (spline overshoot guard).
  for (let i = 1; i < out.length; i++) {
    if (out[i].y >= out[i - 1].y) out[i].y = out[i - 1].y - 0.01;
  }
  return out;
}

/** Dense inner profile ready for volume math and rendering (bottom first). */
export function glassProfile(spec: GlassSpec): ProfilePoint[] {
  return spec.smooth ? smoothProfile(spec.bowl) : spec.bowl;
}

/** Volume of a frustum slice between two profile points (in viewBox units³). */
function frustumVolume(a: ProfilePoint, b: ProfilePoint): number {
  const h = Math.abs(a.y - b.y);
  return (Math.PI * h * (a.r * a.r + a.r * b.r + b.r * b.r)) / 3;
}

/** Total inner volume of the bowl in viewBox units³. */
export function profileVolume(profile: ProfilePoint[]): number {
  let v = 0;
  for (let i = 0; i < profile.length - 1; i++) v += frustumVolume(profile[i], profile[i + 1]);
  return v;
}

/** Inner radius at an arbitrary y, by linear interpolation along the profile. */
export function radiusAt(profile: ProfilePoint[], y: number): number {
  if (y >= profile[0].y) return profile[0].r;
  const rim = profile[profile.length - 1];
  if (y <= rim.y) return rim.r;
  for (let i = 0; i < profile.length - 1; i++) {
    const lo = profile[i]; // larger y (lower in the glass)
    const hi = profile[i + 1];
    if (y <= lo.y && y >= hi.y) {
      const t = lo.y === hi.y ? 0 : (lo.y - y) / (lo.y - hi.y);
      return lo.r + (hi.r - lo.r) * t;
    }
  }
  return rim.r;
}

/**
 * Find the y coordinate at which the bowl contains `volume` units³,
 * measured from the bottom. Solved per frustum by bisection.
 */
export function yForVolume(profile: ProfilePoint[], volume: number): number {
  if (volume <= 0) return profile[0].y;
  let acc = 0;
  for (let i = 0; i < profile.length - 1; i++) {
    const lo = profile[i];
    const hi = profile[i + 1];
    const slice = frustumVolume(lo, hi);
    if (acc + slice >= volume) {
      const target = volume - acc;
      let a = 0;
      let b = lo.y - hi.y;
      for (let k = 0; k < 40; k++) {
        const mid = (a + b) / 2;
        const rMid = lo.r + (hi.r - lo.r) * (mid / (lo.y - hi.y || 1));
        const v = frustumVolume(lo, { y: lo.y - mid, r: rMid });
        if (v < target) a = mid;
        else b = mid;
      }
      return lo.y - (a + b) / 2;
    }
    acc += slice;
  }
  return profile[profile.length - 1].y;
}

/* ------------------------------------------------------------------ */
/* Glass catalogue                                                     */
/* ------------------------------------------------------------------ */

export const GLASSES: Record<GlassId, GlassSpec> = {
  coupe: {
    id: "coupe",
    name: "Coupe",
    description: "Shallow, broad-bowled stemmed glass. The modern home of drinks served 'up' without ice.",
    capacityMl: 150,
    bowl: [
      { y: 132, r: 4 },
      { y: 126, r: 24 },
      { y: 112, r: 44 },
      { y: 92, r: 58 },
      { y: 70, r: 62 },
    ],
    wall: 3,
    base: 2,
    stem: { toY: 242, width: 7 },
    foot: { r: 44, height: 8 },
    smooth: true,
  },
  martini: {
    id: "martini",
    name: "Cocktail glass",
    description: "The classic V-shaped 'martini' glass. The IBA's default for drinks served up.",
    capacityMl: 180,
    bowl: [
      { y: 150, r: 2 },
      { y: 62, r: 70 },
    ],
    wall: 3,
    base: 2,
    stem: { toY: 242, width: 7 },
    foot: { r: 46, height: 8 },
  },
  "nick-and-nora": {
    id: "nick-and-nora",
    name: "Nick & Nora",
    description: "Small bell-shaped stemmed glass. Keeps stirred drinks cold and aromatic.",
    capacityMl: 140,
    bowl: [
      { y: 160, r: 5 },
      { y: 150, r: 26 },
      { y: 128, r: 38 },
      { y: 100, r: 40 },
      { y: 78, r: 37 },
    ],
    wall: 3,
    base: 2,
    stem: { toY: 242, width: 7 },
    foot: { r: 42, height: 8 },
    smooth: true,
  },
  rocks: {
    id: "rocks",
    name: "Old fashioned glass",
    description: "Short, heavy-bottomed tumbler (rocks / lowball) for drinks built over ice.",
    capacityMl: 300,
    bowl: [
      { y: 232, r: 48 },
      { y: 62, r: 56 },
    ],
    wall: 4,
    base: 22,
  },
  highball: {
    id: "highball",
    name: "Highball glass",
    description: "Tall straight tumbler for long drinks topped with soda or juice.",
    capacityMl: 350,
    bowl: [
      { y: 262, r: 34 },
      { y: 32, r: 37 },
    ],
    wall: 3,
    base: 12,
  },
  collins: {
    id: "collins",
    name: "Collins glass",
    description: "Taller and narrower than a highball; made for the Collins family and fizzes.",
    capacityMl: 400,
    bowl: [
      { y: 272, r: 31 },
      { y: 22, r: 33 },
    ],
    wall: 3,
    base: 10,
  },
  flute: {
    id: "flute",
    name: "Champagne flute",
    description: "Tall narrow stemmed glass that preserves sparkle in champagne cocktails.",
    capacityMl: 180,
    bowl: [
      { y: 176, r: 4 },
      { y: 166, r: 14 },
      { y: 126, r: 24 },
      { y: 76, r: 25 },
      { y: 40, r: 21 },
    ],
    wall: 3,
    base: 2,
    stem: { toY: 250, width: 6 },
    foot: { r: 40, height: 8 },
    smooth: true,
  },
  hurricane: {
    id: "hurricane",
    name: "Hurricane glass",
    description: "Curvy, tall, short-stemmed glass for tiki and tropical drinks.",
    capacityMl: 450,
    bowl: [
      { y: 206, r: 8 },
      { y: 196, r: 26 },
      { y: 164, r: 44 },
      { y: 126, r: 40 },
      { y: 96, r: 31 },
      { y: 62, r: 35 },
      { y: 32, r: 40 },
    ],
    wall: 3,
    base: 2,
    stem: { toY: 240, width: 10 },
    foot: { r: 42, height: 8 },
    smooth: true,
  },
  "copper-mug": {
    id: "copper-mug",
    name: "Copper mug",
    description: "The Moscow Mule's signature vessel; the metal keeps the drink ice cold.",
    capacityMl: 400,
    bowl: [
      { y: 246, r: 46 },
      { y: 52, r: 52 },
    ],
    wall: 4,
    base: 8,
    handle: { top: 90, bottom: 200, reach: 30 },
    material: "copper",
  },
  "irish-coffee": {
    id: "irish-coffee",
    name: "Irish coffee glass",
    description: "Footed, handled heat-proof glass for hot drinks.",
    capacityMl: 240,
    bowl: [
      { y: 206, r: 28 },
      { y: 150, r: 33 },
      { y: 60, r: 36 },
      { y: 46, r: 38 },
    ],
    wall: 3,
    base: 4,
    stem: { toY: 236, width: 16 },
    foot: { r: 38, height: 8 },
    handle: { top: 90, bottom: 180, reach: 26 },
    smooth: true,
  },
  wine: {
    id: "wine",
    name: "Wine glass",
    description: "Large stemmed glass; the IBA serves spritzes and some sours in one.",
    capacityMl: 380,
    bowl: [
      { y: 172, r: 6 },
      { y: 162, r: 26 },
      { y: 130, r: 44 },
      { y: 92, r: 44 },
      { y: 50, r: 36 },
    ],
    wall: 3,
    base: 2,
    stem: { toY: 250, width: 7 },
    foot: { r: 44, height: 8 },
    smooth: true,
  },
  "julep-cup": {
    id: "julep-cup",
    name: "Julep cup",
    description: "Silver or pewter cup that frosts over when packed with crushed ice.",
    capacityMl: 350,
    bowl: [
      { y: 240, r: 34 },
      { y: 70, r: 44 },
      { y: 58, r: 46 },
    ],
    wall: 3,
    base: 8,
    material: "silver",
  },
  goblet: {
    id: "goblet",
    name: "Balloon / copa glass",
    description: "Large bowl on a stem; room for lots of ice and aromatics.",
    capacityMl: 500,
    bowl: [
      { y: 182, r: 8 },
      { y: 172, r: 32 },
      { y: 142, r: 56 },
      { y: 100, r: 58 },
      { y: 50, r: 44 },
    ],
    wall: 3,
    base: 2,
    stem: { toY: 250, width: 8 },
    foot: { r: 46, height: 8 },
    smooth: true,
  },
  sling: {
    id: "sling",
    name: "Sling glass",
    description: "Tall, gently tulip-shaped glass for the Singapore Sling and other long drinks.",
    capacityMl: 400,
    bowl: [
      { y: 272, r: 24 },
      { y: 200, r: 28 },
      { y: 120, r: 27 },
      { y: 60, r: 31 },
      { y: 22, r: 33 },
    ],
    wall: 3,
    base: 10,
    smooth: true,
  },
  "punch-cup": {
    id: "punch-cup",
    name: "Punch cup",
    description: "Small handled cup, traditional for punches and rum drinks.",
    capacityMl: 250,
    bowl: [
      { y: 226, r: 34 },
      { y: 100, r: 44 },
    ],
    wall: 3,
    base: 8,
    handle: { top: 120, bottom: 200, reach: 26 },
  },
};

export function getGlass(id: GlassId): GlassSpec {
  return GLASSES[id];
}

export function listGlasses(): GlassSpec[] {
  return Object.values(GLASSES);
}
