import { UNIT_TO_ML, type Amount, type Unit } from "./schema.js";

export type DisplayUnit = "ml" | "cl" | "oz";

/** Convert an amount to millilitres. `piece` is 0; `top` is already an ml estimate. */
export function toMl(amount: Amount): number {
  return amount.value * UNIT_TO_ML[amount.unit];
}

const NON_VOLUMETRIC: ReadonlySet<Unit> = new Set(["dash", "drop", "barspoon", "tsp", "piece"]);

function roundTo(n: number, step: number): number {
  return Math.round(n / step) * step;
}

/**
 * Format an amount for display in the chosen unit system.
 * Non-volumetric units (dashes, pieces...) are kept as-is.
 */
export function formatAmount(amount: Amount, display: DisplayUnit, multiplier = 1): string {
  const value = amount.value * multiplier;
  if (amount.unit === "piece") {
    return value === 1 ? "1" : `${trim(value)}`;
  }
  if (amount.unit === "top") {
    return "top up";
  }
  if (NON_VOLUMETRIC.has(amount.unit)) {
    const label = amount.unit === "barspoon" ? "bar spoon" : amount.unit;
    const plural = amount.unit === "dash" ? "dashes" : `${label}s`;
    return `${trim(value)} ${value === 1 ? label : plural}`;
  }
  const ml = toMl({ value, unit: amount.unit });
  switch (display) {
    case "ml":
      return `${trim(roundTo(ml, 2.5))} ml`;
    case "cl":
      return `${trim(roundTo(ml / 10, 0.25))} cl`;
    case "oz":
      return `${trim(roundTo(ml / UNIT_TO_ML.oz, 0.25))} oz`;
  }
}

function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}
