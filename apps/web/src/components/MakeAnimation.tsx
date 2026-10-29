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
  type ProfilePoint,
  type Recipe,
} from "@bartender/core";

/**
 * "Watch it being made": a shaker-to-glass animation driven by one clock.
 * Every element's state is a pure function of elapsed time, so it can be
 * replayed, scrubbed and rendered at any instant.
 */

interface Props {
  recipe: Recipe;
}

/* ---------- timeline ---------- */

const POUR_EACH = 1000;
const ICE = 1000;
const CAP = 500;
const SHAKE = 1800;
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

function buildPhases(recipe: Recipe): Phase[] {
  const phases: Phase[] = [];
  let t = 0;
  const push = (key: string, dur: number, caption: string) => {
    phases.push({ key, start: t, end: t + dur, caption });
    t += dur;
  };
  for (const ing of recipe.ingredients) push(`pour-${ing.id}`, POUR_EACH, `Add ${formatAmount(ing.amount, "ml")} ${ing.name.toLowerCase()}`);
  push("ice", ICE, "Fill the shaker with ice");
  push("cap", CAP, "Cap it");
  push("shake", SHAKE, "Shake hard until the shaker frosts over");
  push("tilt", TILT, "Strain into the chilled coupe");
  push("strain", STRAIN, "Strain into the chilled coupe");
  push("return", RETURN, "Strain into the chilled coupe");
  push("garnish", GARNISH, `Garnish: ${recipe.garnish.toLowerCase()}`);
  push("settle", SETTLE, `${recipe.name}. Cheers!`);
  push("hold", HOLD, `${recipe.name}. Cheers!`);
  return phases;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeOut = (x: number) => 1 - (1 - x) * (1 - x);
const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

/** Progress 0..1 through a phase (0 before it, 1 after). */
function progress(phases: Phase[], key: string, t: number): number {
  const p = phases.find((x) => x.key === key);
  if (!p) return 0;
  return clamp01((t - p.start) / (p.end - p.start));
}

/* ---------- geometry ---------- */

// Cobbler shaker, in local coordinates centred on CENTER_X (like the glass profiles), y down.
const SHAKER: ProfilePoint[] = [
  { y: 150, r: 28 },
  { y: 20, r: 36 },
];
const CX = CENTER_X;
const SHAKER_LIP_Y = 20;
const SHAKER_FILL = 0.55; // liquids reach this share of the shaker before ice goes in

const SCENE_W = 440;
const SCENE_H = 310;
const COUPE_X = 200; // scene x where the coupe's local x=0 lands
const COUPE_Y = 24;
const COUNTER_Y = 224;

// Where the shaker's lip sits when upright on the counter, and when tilted over the coupe.
const LIP_UPRIGHT = { x: 110, y: COUNTER_Y - (SHAKER[0].y - SHAKER_LIP_Y) - 4 };
const LIP_POURING = { x: COUPE_X + CX - 22, y: 52 };
const POUR_ANGLE = 112;

function shakerBody(): string {
  const [b, top] = SHAKER;
  const w = 3;
  return `M ${CX - top.r - w} ${top.y} L ${CX - b.r - w} ${b.y + 4} L ${CX + b.r + w} ${b.y + 4} L ${CX + top.r + w} ${top.y} Z`;
}

function mixColor(recipe: Recipe): string {
  let r = 0;
  let g = 0;
  let b = 0;
  let total = 0;
  for (const ing of recipe.ingredients) {
    const ml = toMl(ing.amount);
    if (ml <= 0) continue;
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

/* ---------- clock ---------- */

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

/* ---------- component ---------- */

export default function MakeAnimation({ recipe }: Props) {
  const phases = useMemo(() => buildPhases(recipe), [recipe]);
  const duration = phases[phases.length - 1].end;
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const { t, playing, play, pause, seek, restart } = useClock(duration);
  const time = reduced && t === 0 ? duration : t;

  const diagram = useMemo(() => computeDiagram(recipe), [recipe]);
  const coupe = useMemo(() => glassPaths(diagram.glass), [diagram.glass]);
  const mixed = useMemo(() => mixColor(recipe), [recipe]);
  const liquids = recipe.ingredients.filter((i) => toMl(i.amount) > 0 && i.role !== "rinse");
  const totalMl = liquids.reduce((s, i) => s + toMl(i.amount), 0);
  const shakerCapacity = profileVolume(SHAKER);

  // Shaker contents: cumulative share poured so far → level.
  let pouredShare = 0;
  let activePour: { ing: (typeof liquids)[number]; p: number } | null = null;
  for (const ing of liquids) {
    const p = progress(phases, `pour-${ing.id}`, time);
    const share = toMl(ing.amount) / totalMl;
    pouredShare += share * easeOut(p);
    if (p > 0 && p < 1) activePour = { ing, p };
  }
  const pStrain = easeInOut(progress(phases, "strain", time));
  const shakerLiquidShare = pouredShare * (1 - pStrain);
  const shakerLevelY = yForVolume(SHAKER, shakerLiquidShare * SHAKER_FILL * shakerCapacity);

  const pIce = progress(phases, "ice", time);
  const pCap = easeInOut(progress(phases, "cap", time));
  const pShake = progress(phases, "shake", time);
  const pTilt = easeInOut(progress(phases, "tilt", time));
  const pReturn = easeInOut(progress(phases, "return", time));
  const pGarnish = easeOut(progress(phases, "garnish", time));
  const pSettle = easeInOut(progress(phases, "settle", time));

  // Shaker transform, anchored on its lip: upright on the counter → tilted over the coupe.
  const tilt = pTilt * (1 - pReturn);
  const shaking = pShake > 0 && pShake < 1;
  const shakeWobble = shaking ? Math.sin(time / 38) * 14 : 0;
  const shakeLift = shaking ? Math.abs(Math.sin(time / 76)) * 10 : 0;
  const lipX = LIP_UPRIGHT.x + (LIP_POURING.x - LIP_UPRIGHT.x) * tilt + shakeWobble * 0.3;
  const lipY = LIP_UPRIGHT.y + (LIP_POURING.y - LIP_UPRIGHT.y) * tilt - shakeLift;
  const shakerAngle = tilt * POUR_ANGLE + shakeWobble;
  const shakerFade = pReturn;
  // The shaker is drawn see-through while it is being filled, then turns opaque once shaken.
  const contentsOpacity = 1 - clamp01(pShake * 3);

  // Coupe level.
  const coupeBottomY = diagram.profile[0].y;
  const coupeTopY = diagram.liquidTopY;
  const coupeFillY = coupeBottomY - (coupeBottomY - coupeTopY) * pStrain;
  const coupeFilling = pStrain > 0 && pStrain < 1;

  // Garnish (a cherry): drops from above the rim and sinks to the bottom.
  const cherryStart = coupe.rimY - 30;
  const cherryEnd = coupeBottomY - 9;
  const cherryY = cherryStart + (cherryEnd - cherryStart) * pGarnish;

  const phase = phases.find((p) => time >= p.start && time < p.end) ?? phases[phases.length - 1];
  const mixedOpacity = 1 - pSettle;

  return (
    <div className="make-animation">
      <svg viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} className="scene" role="img" aria-label={`Animation of making the ${recipe.name}`}>
        <defs>
          <clipPath id="anim-shaker">
            <polygon points={bandPolygon(SHAKER, SHAKER[0].y, SHAKER_LIP_Y)} />
          </clipPath>
          <clipPath id="anim-coupe">
            <polygon points={coupe.bowlPoints} />
          </clipPath>
        </defs>

        {/* Counter */}
        <line x1={20} y1={COUNTER_Y} x2={SCENE_W - 20} y2={COUNTER_Y} stroke="var(--line)" strokeWidth={2} />

        {/* Coupe */}
        <g transform={`translate(${COUPE_X} ${COUPE_Y})`}>
          <path d={coupe.body} fill="var(--glass-fill)" stroke="var(--glass-stroke)" strokeWidth={2} strokeLinejoin="round" />
          {coupe.stem && <path d={coupe.stem} fill="var(--glass-fill)" stroke="var(--glass-stroke)" strokeWidth={2} />}
          {coupe.foot && <path d={coupe.foot} fill="var(--glass-fill)" stroke="var(--glass-stroke)" strokeWidth={2} />}
          <g clipPath="url(#anim-coupe)">
            {pStrain > 0 && <polygon points={bandPolygon(diagram.profile, coupeBottomY, coupeFillY)} fill={mixed} fillOpacity={0.92 * mixedOpacity} />}
            {pSettle > 0 &&
              diagram.layers.map((l) => <polygon key={l.ingredient.id} points={l.points} fill={l.ingredient.color} fillOpacity={0.9 * pSettle} stroke="rgba(255,255,255,0.7)" strokeWidth={pSettle} />)}
            {coupeFilling && (
              <ellipse cx={CENTER_X} cy={coupeFillY} rx={radiusAt(diagram.profile, coupeFillY)} ry={2.5} fill="rgba(255,255,255,0.5)" />
            )}
            {pGarnish > 0 && (
              <g>
                <line x1={CENTER_X + 2} y1={cherryY - 6} x2={CENTER_X + 9} y2={cherryY - 22} stroke="#5a3a1a" strokeWidth={1.4} strokeLinecap="round" />
                <circle cx={CENTER_X} cy={cherryY} r={6} fill="#9b1b30" stroke="#5e0f1d" strokeWidth={1} />
                <circle cx={CENTER_X - 2} cy={cherryY - 2} r={1.5} fill="rgba(255,255,255,0.5)" />
              </g>
            )}
          </g>
          <path d={coupe.bowl} fill="none" stroke="var(--glass-stroke)" strokeWidth={1.5} strokeOpacity={0.7} />
          <ellipse cx={CENTER_X} cy={coupe.rimY} rx={coupe.rimR + diagram.glass.wall} ry={4} fill="none" stroke="var(--glass-stroke)" strokeWidth={1.5} strokeOpacity={0.6} />
        </g>

        {/* Stream from the shaker into the coupe */}
        {coupeFilling && (
          <path
            d={`M ${LIP_POURING.x} ${LIP_POURING.y} Q ${COUPE_X + CX - 8} ${COUPE_Y + coupe.rimY - 10} ${COUPE_X + CX} ${COUPE_Y + coupeFillY}`}
            fill="none"
            stroke={mixed}
            strokeWidth={4}
            strokeLinecap="round"
            opacity={0.9}
          />
        )}

        {/* Ingredient pour into the shaker */}
        {activePour && (
          <g>
            <rect
              x={LIP_UPRIGHT.x - 2}
              y={-10}
              width={4}
              height={LIP_UPRIGHT.y - SHAKER_LIP_Y + shakerLevelY + 10}
              rx={2}
              fill={activePour.ing.color}
              stroke="rgba(0,0,0,0.08)"
              strokeWidth={0.5}
              opacity={Math.min(1, activePour.p * 6, (1 - activePour.p) * 6)}
            />
            <text x={LIP_UPRIGHT.x + 16} y={28} fontSize={11} fontWeight={600} fill="var(--ink)" opacity={Math.min(1, activePour.p * 4)}>
              {formatAmount(activePour.ing.amount, "ml")} {activePour.ing.name}
            </text>
          </g>
        )}

        {/* Shaker */}
        <g transform={`translate(${lipX - CX} ${lipY - SHAKER_LIP_Y}) rotate(${shakerAngle} ${CX} ${SHAKER_LIP_Y})`} opacity={1 - shakerFade}>
          <path d={shakerBody()} fill="#d9dde3" stroke="#6f7a86" strokeWidth={2} strokeLinejoin="round" />
          <g clipPath="url(#anim-shaker)" opacity={contentsOpacity}>
            {shakerLiquidShare > 0 && (
              <polygon points={bandPolygon(SHAKER, SHAKER[0].y, shakerLevelY)} fill={pShake >= 1 ? mixed : "none"} fillOpacity={0.95} />
            )}
            {shakerLiquidShare > 0 &&
              pShake < 1 &&
              (() => {
                // Before shaking, the shaker shows the ingredients as layers in pour order.
                let acc = 0;
                return liquids.map((ing) => {
                  const p = easeOut(progress(phases, `pour-${ing.id}`, time));
                  const share = (toMl(ing.amount) / totalMl) * p;
                  const y0 = yForVolume(SHAKER, acc * SHAKER_FILL * shakerCapacity);
                  acc += share;
                  const y1 = yForVolume(SHAKER, acc * SHAKER_FILL * shakerCapacity);
                  if (share <= 0) return null;
                  return <polygon key={ing.id} points={bandPolygon(SHAKER, y0, y1)} fill={ing.color} fillOpacity={0.95} />;
                });
              })()}
            {pIce > 0 &&
              [0, 1, 2, 3].map((i) => {
                const start = i * 0.18;
                const p = easeOut(clamp01((pIce - start) / (1 - start)));
                if (p <= 0) return null;
                const restY = shakerLevelY - 4 - (i % 2) * 20 - Math.floor(i / 2) * 2;
                const y = -40 + (restY + 40) * p;
                const x = CX + (i % 2 === 0 ? -12 : 12) + (i >= 2 ? 4 : -4);
                return <rect key={i} x={x - 10} y={y - 10} width={20} height={20} rx={4} transform={`rotate(${(i * 23) % 40 - 20} ${x} ${y})`} fill="rgba(255,255,255,0.6)" stroke="rgba(255,255,255,0.95)" strokeWidth={1.2} />;
              })}
          </g>
          {/* Shaker rim */}
          <ellipse cx={CX} cy={SHAKER_LIP_Y} rx={SHAKER[1].r + 3} ry={4} fill="none" stroke="#6f7a86" strokeWidth={2} />
          {/* Cap: hovers above until the cap phase, then seats itself. */}
          <g transform={`translate(0 ${-34 * (1 - pCap)})`} opacity={pCap > 0 || pIce >= 1 ? 1 : 0}>
            <path d={`M ${CX - SHAKER[1].r - 3} ${SHAKER_LIP_Y} L ${CX - SHAKER[1].r + 6} ${SHAKER_LIP_Y - 18} L ${CX + SHAKER[1].r - 6} ${SHAKER_LIP_Y - 18} L ${CX + SHAKER[1].r + 3} ${SHAKER_LIP_Y} Z`} fill="#c9ced6" stroke="#6f7a86" strokeWidth={2} strokeLinejoin="round" />
            <rect x={CX - 10} y={SHAKER_LIP_Y - 28} width={20} height={11} rx={3} fill="#c9ced6" stroke="#6f7a86" strokeWidth={2} />
          </g>
          {/* Frost while shaking */}
          {pShake > 0.3 && pShake < 1 && <path d={shakerBody()} fill="rgba(255,255,255,0.45)" stroke="none" />}
        </g>

        {/* Motion lines while shaking */}
        {shaking && (
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
