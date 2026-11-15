// Theme: Dark after sunset, Light after sunrise (Auto), or a fixed
// choice. Stored per device. Auto uses sunrise/sunset for the location the user
// shares once in Settings; without it, 7 AM / 7 PM.
import { useEffect, useState } from 'react';
import * as SunCalc from 'suncalc';

export type ThemeMode = 'auto' | 'night' | 'day';
const KEY = 'fh.theme';
const LOC_KEY = 'fh.sunloc';

function read<T>(k: string, fallback: T): T {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* private mode */
  }
}

export function getMode(): ThemeMode {
  return read<ThemeMode>(KEY, 'auto');
}

export function setMode(m: ThemeMode) {
  write(KEY, m);
  apply();
  window.dispatchEvent(new Event('fh-theme'));
}

export function getSunLocation(): { lat: number; lng: number } | null {
  return read<{ lat: number; lng: number } | null>(LOC_KEY, null);
}

export function setSunLocation(loc: { lat: number; lng: number } | null) {
  write(LOC_KEY, loc);
  apply();
}

export function resolvedTheme(now = new Date()): 'night' | 'day' {
  const m = getMode();
  if (m !== 'auto') return m;
  const loc = getSunLocation();
  if (loc) {
    const t = SunCalc.getTimes(now, loc.lat, loc.lng);
    if (t.sunrise && t.sunset && !isNaN(t.sunrise.getTime()) && !isNaN(t.sunset.getTime())) {
      return now >= t.sunrise && now < t.sunset ? 'day' : 'night';
    }
  }
  const h = now.getHours();
  return h >= 7 && h < 19 ? 'day' : 'night';
}

export function apply() {
  const t = resolvedTheme();
  document.documentElement.dataset.theme = t;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t === 'night' ? '#0E1330' : '#F6F1E7');
}

/** Re-evaluate every minute so Auto flips at sunset without a reload. */
export function startThemeClock() {
  apply();
  setInterval(apply, 60_000);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && apply());
}

export function useTheme(): { mode: ThemeMode; theme: 'night' | 'day' } {
  const [state, setState] = useState(() => ({ mode: getMode(), theme: resolvedTheme() }));
  useEffect(() => {
    const on = () => setState({ mode: getMode(), theme: resolvedTheme() });
    window.addEventListener('fh-theme', on);
    const t = setInterval(on, 60_000);
    return () => {
      window.removeEventListener('fh-theme', on);
      clearInterval(t);
    };
  }, []);
  return state;
}
