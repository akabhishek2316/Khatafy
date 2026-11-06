// Offline expense drafts. Only NEW expenses can be queued: each draft carries its own
// idempotency key, so a retry (even after a lost response) can never create a duplicate.
// Edits, voids and payments always need a connection, so a stale copy can never silently
// overwrite a financial record (the database additionally enforces version checks).
import { isPermanentError, toKhError } from './errors';
import type { Api } from './api';
import type { ExpenseInput } from './types';

export interface StorageAdapter {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

export interface ExpenseDraft {
  id: string; // doubles as the idempotency key
  groupId: string;
  input: ExpenseInput;
  createdAt: string;
  status: 'pending' | 'failed';
  attempts: number;
  lastError?: string; // error code for failed drafts
}

export function newId(): string {
  const c = (globalThis as any).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export class DraftQueue {
  constructor(private storage: StorageAdapter, private key = 'khatafy.drafts.v1') {}

  async list(): Promise<ExpenseDraft[]> {
    try {
      const raw = await this.storage.getItem(this.key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as ExpenseDraft[]) : [];
    } catch {
      return [];
    }
  }
  private async save(list: ExpenseDraft[]) {
    await this.storage.setItem(this.key, JSON.stringify(list));
  }
  async add(groupId: string, input: ExpenseInput): Promise<ExpenseDraft> {
    const d: ExpenseDraft = { id: newId(), groupId, input, createdAt: new Date().toISOString(), status: 'pending', attempts: 0 };
    await this.save([...(await this.list()), d]);
    return d;
  }
  async remove(id: string) {
    await this.save((await this.list()).filter((d) => d.id !== id));
  }
  async update(id: string, patch: Partial<ExpenseDraft>) {
    await this.save((await this.list()).map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }
  /** Lets the user retry a failed draft after fixing the cause. */
  async retry(id: string) {
    await this.update(id, { status: 'pending', lastError: undefined });
  }
}

export interface SyncResult { synced: number; failed: number; remaining: number; stoppedOffline: boolean }

export async function syncDrafts(queue: DraftQueue, api: Pick<Api, 'createExpense'>): Promise<SyncResult> {
  let synced = 0;
  let failed = 0;
  let stoppedOffline = false;
  for (const d of await queue.list()) {
    if (d.status !== 'pending') continue;
    try {
      await api.createExpense(d.groupId, d.id, d.input);
      await queue.remove(d.id);
      synced++;
    } catch (e) {
      const err = toKhError(e);
      if (isPermanentError(err.code)) {
        await queue.update(d.id, { status: 'failed', lastError: err.code, attempts: d.attempts + 1 });
        failed++;
      } else {
        await queue.update(d.id, { attempts: d.attempts + 1, lastError: err.code });
        stoppedOffline = true;
        break; // network is down: keep order, try again later
      }
    }
  }
  const remaining = (await queue.list()).length;
  return { synced, failed, remaining, stoppedOffline };
}
