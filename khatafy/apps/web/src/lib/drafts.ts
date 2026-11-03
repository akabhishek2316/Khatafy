import { DraftQueue, syncDrafts, type StorageAdapter } from '@khatafy/core';
import { api } from './supabase';
import { invalidate } from './data';

const adapter: StorageAdapter = {
  getItem: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  setItem: (k, v) => { localStorage.setItem(k, v); },
  removeItem: (k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};
export const draftQueue = new DraftQueue(adapter);

const listeners = new Set<() => void>();
export const onDraftsChanged = (cb: () => void) => { listeners.add(cb); return () => void listeners.delete(cb); };
export const draftsChanged = () => listeners.forEach((l) => l());

let syncing = false;
export async function syncNow() {
  if (syncing) return null;
  syncing = true;
  try {
    const r = await syncDrafts(draftQueue, api);
    if (r.synced) invalidate('g:');
    draftsChanged();
    return r;
  } finally { syncing = false; }
}

/** Retry queued offline drafts when the browser comes back online, on focus, and every minute. */
export function startDraftSync() {
  const run = () => { if (navigator.onLine) void syncNow(); };
  window.addEventListener('online', run);
  window.addEventListener('focus', run);
  const timer = setInterval(run, 60_000);
  run();
  return () => { window.removeEventListener('online', run); window.removeEventListener('focus', run); clearInterval(timer); };
}
