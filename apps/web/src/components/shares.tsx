import { useT } from '../lib/i18n';
import { Avatar, Badge, Card } from './ui';

export interface ShareRow { id: string; name: string; share: number; paid: number; status?: string }

/** Month-end view: what each person's share came to, what they paid, and the difference. */
export function MemberShares({ rows, total, me, title, hint }: { rows: ShareRow[]; total: number; me?: string; title?: string; hint?: string }) {
  const { t, money } = useT();
  const shown = rows.filter((r) => r.status === undefined || r.status === 'active' || r.share > 0 || r.paid > 0);
  const n = rows.filter((r) => r.status === undefined || r.status === 'active').length || shown.length || 1;
  const avg = Math.round(total / n);
  return (
    <Card title={title ?? t('share.title')}>
      <div className="share-avg"><span className="muted small">{t('share.avg')}</span><strong data-testid="share-avg">{money(avg)}</strong></div>
      <p className="muted small">{hint ?? t('share.avg_hint', { n })}</p>
      <div className="table-wrap"><table className="table" data-testid="member-shares">
        <thead><tr><th>{t('report.member')}</th><th className="num">{t('share.col_share')}</th><th className="num">{t('share.col_percent')}</th><th className="num">{t('share.col_paid')}</th><th className="num">{t('share.col_diff')}</th></tr></thead>
        <tbody>{shown.map((r) => {
          const diff = r.paid - r.share;
          return (
            <tr key={r.id}>
              <td><span className="share-name"><Avatar name={r.name} size={24} />{r.name}{r.id === me && <> <Badge>{t('common.you')}</Badge></>}</span></td>
              <td className="num"><strong>{money(r.share)}</strong></td>
              <td className="num">{total > 0 ? ((r.share / total) * 100).toFixed(1) : '0.0'}%</td>
              <td className="num">{money(r.paid)}</td>
              <td className={`num ${diff >= 0 ? 'pos-text' : 'neg-text'}`}>{money(diff, { sign: true })}</td>
            </tr>
          );
        })}</tbody>
        <tfoot><tr><th>{t('share.total')}</th><th className="num">{money(shown.reduce((a, r) => a + r.share, 0))}</th><th /><th className="num">{money(shown.reduce((a, r) => a + r.paid, 0))}</th><th /></tr></tfoot>
      </table></div>
    </Card>
  );
}
