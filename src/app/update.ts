// Registers the service worker and tells the app when a new version is ready.
import { Workbox } from 'workbox-window';

let wb: Workbox | null = null;
let waiting = false;
const listeners = new Set<() => void>();

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  wb = new Workbox('/sw.js', { scope: '/' });
  wb.addEventListener('waiting', () => {
    waiting = true;
    listeners.forEach((l) => l());
  });
  wb.addEventListener('controlling', () => window.location.reload());
  void wb.register();
  // look for updates whenever the app comes back to the foreground
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void wb?.update();
  });
}

export function onUpdateReady(fn: () => void): () => void {
  listeners.add(fn);
  if (waiting) fn();
  return () => listeners.delete(fn);
}

export function applyUpdate() {
  wb?.messageSkipWaiting();
}
