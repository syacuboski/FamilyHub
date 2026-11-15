// Web Push subscription for task and event reminders.
// iPhone: works only after "Add to Home Screen" (iOS 16.4+), opened from the icon.
import { pb, currentUser } from './pb';

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export type PushState = 'unsupported' | 'needs-install' | 'not-configured' | 'denied' | 'off' | 'on';

function urlB64ToUint8(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

export async function pushState(): Promise<PushState> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return isIOS() && !standalone() ? 'needs-install' : 'unsupported';
  }
  if (!VAPID) return 'not-configured';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? 'on' : 'off';
}

export async function enablePush(): Promise<PushState> {
  if (!VAPID) return 'not-configured';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'off';
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(VAPID) }));
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  const me = currentUser()!;
  const existing = await pb.collection('push_subscriptions').getList(1, 1, { filter: pb.filter('endpoint = {:e}', { e: json.endpoint }) });
  const data = { user: me.id, household: me.household, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, ua: navigator.userAgent.slice(0, 200) };
  if (existing.items.length) await pb.collection('push_subscriptions').update(existing.items[0].id, data);
  else await pb.collection('push_subscriptions').create(data);
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    try {
      const existing = await pb.collection('push_subscriptions').getList(1, 1, { filter: pb.filter('endpoint = {:e}', { e: sub.endpoint }) });
      if (existing.items.length) await pb.collection('push_subscriptions').delete(existing.items[0].id);
    } catch {
      /* offline: the worker prunes dead endpoints */
    }
    await sub.unsubscribe();
  }
  return 'off';
}
