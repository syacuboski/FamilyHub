// Who's eating: adults + kids tonight, plus extra meal prep portions.
// Read from the URL (so the menu, cook mode and labels agree) with the last
// numbers used on this phone as the fallback.
import { portionsFor } from './scale';

export interface Plan { adults: number; kids: number; prepA: number; prepK: number }

const KEY = 'fh.headcount';
const DEFAULT: Plan = { adults: 2, kids: 1, prepA: 0, prepK: 0 };

export function lastHeadcount(): Plan {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    return v ? { ...DEFAULT, ...v, prepA: 0, prepK: 0 } : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function rememberHeadcount(p: Plan) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ adults: p.adults, kids: p.kids }));
  } catch {
    /* private mode */
  }
}

const n = (v: string | null, d: number) => {
  const x = v === null ? NaN : parseInt(v, 10);
  return isNaN(x) ? d : Math.max(0, Math.min(999, x));
};

export function planFromParams(params: URLSearchParams): Plan {
  const d = lastHeadcount();
  return { adults: n(params.get('a'), d.adults), kids: n(params.get('k'), d.kids), prepA: n(params.get('pa'), 0), prepK: n(params.get('pk'), 0) };
}

export function planToQuery(p: Plan): string {
  return `a=${p.adults}&k=${p.kids}&pa=${p.prepA}&pk=${p.prepK}`;
}

export function planTotals(p: Plan, kidPortion = 0.5) {
  return portionsFor({ adults: p.adults, kids: p.kids, prepAdult: p.prepA, prepKid: p.prepK }, kidPortion);
}

export function describePlan(p: Plan): string {
  const parts = [`${p.adults} adult${p.adults === 1 ? '' : 's'}`];
  if (p.kids) parts.push(`${p.kids} kid${p.kids === 1 ? '' : 's'}`);
  return parts.join(' + ');
}
