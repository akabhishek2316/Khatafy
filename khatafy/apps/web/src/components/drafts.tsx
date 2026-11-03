import { useCallback, useEffect, useState } from 'react';
import type { ExpenseDraft } from '@khatafy/core';
import { draftQueue, draftsChanged, onDraftsChanged, syncNow } from '../lib/drafts';
import { useT } from '../lib/i18n';
import { useToast } from '../lib/toast';
import { Button } from './ui';

/** Shows expenses saved while offline, their sync state, and lets the user retry or discard them. */
export function DraftBanner({ groupId }: { groupId: string }) {
  const { t, errorText, money } = useT();
  const toast = useToast();
  const [drafts, setDrafts] = useState<ExpenseDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(() => { draftQueue.list().then((l) => setDrafts(l.filter((d) => d.groupId === groupId))); }, [groupId]);

  useEffect(() => { refresh(); return onDraftsChanged(refresh); }, [refresh]);
  const sync = useCallback(async () => {
    if (!navigator.onLine) return;
    setBusy(true);
    const r = await syncNow();
    setBusy(false);
    if (r?.synced) toast.push('success', t('draft.synced', { n: r.synced }));
  }, [t, toast]);
  useEffect(() => {
    const on = () => { void sync(); };
    window.addEventListener('online', on);
    void sync();
    return () => window.removeEventListener('online', on);
  }, [sync]);

  if (!drafts.length) return null;
  return (
    <div className="banner banner-info" role="status" data-testid="draft-banner">
      <strong>{t('draft.title', { n: drafts.length })}</strong>
      <ul className="draft-list">
        {drafts.map((d) => (
          <li key={d.id}>
            <span>{d.input.title} · {money(d.input.amountPaise)} · {d.status === 'failed' ? <span className="neg">{t('draft.failed')}: {errorText({ message: d.lastError })}</span> : t('draft.pending')}</span>
            {d.status === 'failed' && <Button variant="ghost" onClick={async () => { await draftQueue.retry(d.id); draftsChanged(); void sync(); }}>{t('common.retry')}</Button>}
            <Button variant="ghost" onClick={async () => { await draftQueue.remove(d.id); draftsChanged(); }}>{t('draft.discard')}</Button>
          </li>
        ))}
      </ul>
      <Button variant="secondary" loading={busy} onClick={() => void sync()}>{t('draft.sync_now')}</Button>
    </div>
  );
}
