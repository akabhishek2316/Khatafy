import type { PeriodClose } from '@khatafy/core';
import { useT } from '../lib/i18n';
import { Select } from './ui';

export const EPOCH = '1970-01-01T00:00:00Z';

/** Exact [from, to) boundaries of the "current" (open) period or of one closed period. */
export function periodBounds(closes: PeriodClose[], id: string): { from: string; to: string } | null {
  if (id === 'current') {
    const last = [...closes].sort((a, b) => (a.cut_at < b.cut_at ? 1 : -1))[0];
    return { from: last ? last.cut_at : EPOCH, to: new Date(Date.now() + 60_000).toISOString() };
  }
  const c = closes.find((x) => x.id === id);
  return c ? { from: c.from_at ?? EPOCH, to: c.cut_at } : null;
}

export function PeriodPicker({ closes, value, onChange }: { closes: PeriodClose[]; value: string; onChange: (id: string) => void }) {
  const { t, date } = useT();
  const day = (d: string) => date(`${d}T12:00:00Z`);
  return (
    <>
      <Select label={t('period.pick')} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="current">{t('period.current')}</option>
        {closes.map((c) => (
          <option key={c.id} value={c.id}>{(c.summary?.from_date ? day(c.summary.from_date.slice(0, 10)) : '…') + ' – ' + day(c.period_end)}</option>
        ))}
      </Select>
      <p className="muted small no-print">{t('period.hint')}</p>
    </>
  );
}
