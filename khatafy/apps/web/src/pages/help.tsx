import { useT } from '../lib/i18n';
import { SUPPORT_EMAIL } from '../lib/supabase';
import { Card } from '../components/ui';

export function HelpPage() {
  const { t } = useT();
  return (
    <>
      <h1>{t('help.title')}</h1>
      <p className="muted">{t('help.sub')}</p>
      <Card>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
          <details key={n} className="faq">
            <summary>{t(`help.q${n}`)}</summary>
            <p>{t(`help.a${n}`)}</p>
          </details>
        ))}
      </Card>
      {SUPPORT_EMAIL && <Card><a className="btn btn-secondary" href={`mailto:${SUPPORT_EMAIL}`}>✉️ {t('help.contact')}</a></Card>}
    </>
  );
}
