// Portion math for the recipe scaler, cook mode and meal prep labels.

/** 2.5 → "2½", 0.25 → "¼", 12.4 → "12½" (quarters below 10, halves above) */
export function fmtQty(n: number): string {
  if (!isFinite(n) || n <= 0) return n === 0 ? '0' : '';
  if (n >= 20) return String(Math.round(n));
  const step = n >= 10 ? 2 : 4; // halves above 10, quarters below
  const r = Math.round(n * step) / step;
  if (r === 0) {
    // tiny amounts: show thirds/eighths rather than 0
    if (n >= 0.3) return '⅓';
    return '⅛';
  }
  const w = Math.floor(r);
  const f = +(r - w).toFixed(2);
  const frac = f === 0.25 ? '¼' : f === 0.5 ? '½' : f === 0.75 ? '¾' : '';
  return (w ? String(w) : '') + frac;
}

export interface PortionPlan {
  adults: number;
  kids: number;
  prepAdult?: number;
  prepKid?: number;
}

/** Adult-portion equivalents. A kid portion counts as `kidPortion` of an adult one. */
export function portionsFor(p: PortionPlan, kidPortion = 0.5) {
  const tonight = p.adults + p.kids * kidPortion;
  const prep = (p.prepAdult || 0) + (p.prepKid || 0) * kidPortion;
  return { tonight, prep, total: tonight + prep, containers: (p.prepAdult || 0) + (p.prepKid || 0) };
}

/** Factor to multiply each ingredient by, given the recipe's written servings. */
export function scaleFactor(total: number, servings: number): number {
  if (!servings || servings <= 0) return 1;
  return total / servings;
}

export function caloriesFrom(protein: number, carbs: number, fat: number): number {
  return Math.round(4 * (protein || 0) + 4 * (carbs || 0) + 9 * (fat || 0));
}

const UNICODE_FRACTIONS: Record<string, number> = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875 };

/** "1 1/2" | "1½" | "1.5" | "3/4" → number; NaN when not a quantity */
export function parseQty(s: string): number {
  const t = s.trim();
  if (!t) return NaN;
  let m = t.match(/^(\d+)\s*([¼½¾⅓⅔⅛⅜⅝⅞])$/);
  if (m) return Number(m[1]) + UNICODE_FRACTIONS[m[2]];
  if (UNICODE_FRACTIONS[t] !== undefined) return UNICODE_FRACTIONS[t];
  m = t.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (m) return Number(m[1]) + Number(m[2]) / Number(m[3]);
  m = t.match(/^(\d+)\/(\d+)$/);
  if (m) return Number(m[1]) / Number(m[2]);
  m = t.match(/^(\d+(?:\.\d+)?)$/);
  if (m) return Number(m[1]);
  m = t.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/); // "2-3" → upper bound
  if (m) return Number(m[2]);
  return NaN;
}

/** 170 → "2 hr 50 min", 45 → "45 min", 60 → "1 hr" */
export function fmtMinutes(m: number): string {
  if (!m) return '';
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} min` : ''}`;
}
