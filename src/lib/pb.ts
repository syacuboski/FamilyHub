// PocketBase client. In production the app is served by PocketBase itself, so
// the API is same-origin. In dev, Vite proxies /api to 127.0.0.1:8090.
import PocketBase from 'pocketbase';
import type { User } from './types';

export const pb = new PocketBase(window.location.origin);
pb.autoCancellation(false);

export function currentUser(): User | null {
  return (pb.authStore.record as unknown as User) || null;
}

export function householdId(): string {
  return currentUser()?.household || '';
}

/** 15-char [a-z0-9] id, the same shape PocketBase generates. Lets offline
 *  creates use their final id so later edits and deletes line up. */
export function newId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(15));
  let s = '';
  for (const b of bytes) s += chars[b % chars.length];
  return s;
}

export async function signIn(email: string, password: string) {
  return pb.collection('users').authWithPassword(email.trim(), password);
}

export function signOut() {
  pb.authStore.clear();
}

/** Refresh the token when online; keep the cached session when offline. */
export async function refreshAuth(): Promise<void> {
  if (!pb.authStore.isValid || !navigator.onLine) return;
  try {
    await pb.collection('users').authRefresh();
  } catch (e: unknown) {
    const status = (e as { status?: number }).status;
    if (status === 401 || status === 403) pb.authStore.clear();
  }
}

export function fileUrl(rec: { id: string; collectionId?: string; collectionName?: string } & Record<string, unknown>, file: string | undefined, thumb?: string): string {
  if (!file) return '';
  return pb.files.getURL(rec as never, file, thumb ? { thumb } : undefined);
}
