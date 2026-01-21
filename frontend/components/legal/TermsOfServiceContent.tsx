import { getTranslations } from 'next-intl/server';
import LegalBlock from './LegalBlock';

export const TERMS_LAST_UPDATED = '2025-12-14';

const linkClass =
  'underline underline-offset-4 hover:text-blue-600 dark:hover:text-blue-400 transition-colors';

export default async function TermsOfServiceContent() {
  const t = await getTranslations('legal.terms');
  const tLegal = await getTranslations('legal');
  const email = tLegal('contactEmail');

  return (
    <div className="space-y-6">
      <LegalBlock id="acceptance" title={t('acceptance.title')}>
        <p>{t('acceptance.content')}</p>
      </LegalBlock>

      <LegalBlock id="accounts" title={t('accounts.title')}>
        <p>{t('accounts.content')}</p>
      </LegalBlock>

      <LegalBlock id="features" title={t('features.title')}>
        <ul className="list-disc pl-5 space-y-2">
          <li>{t('features.feature1')}</li>
          <li>{t('features.feature2')}</li>
          <li>{t('features.feature3')}</li>
        </ul>
      </LegalBlock>

      <LegalBlock id="prohibited" title={t('prohibited.title')}>
        <ul className="list-disc pl-5 space-y-2">
          <li>{t('prohibited.item1')}</li>
          <li>{t('prohibited.item2')}</li>
        </ul>
      </LegalBlock>

      <LegalBlock id="ip" title={t('ip.title')}>
        <p>{t('ip.content')}</p>
      </LegalBlock>

      <LegalBlock id="disclaimer" title={t('disclaimer.title')}>
        <p>{t('disclaimer.content')}</p>
      </LegalBlock>

      <LegalBlock id="liability" title={t('liability.title')}>
        <p>{t('liability.content')}</p>
      </LegalBlock>

      <LegalBlock id="termination" title={t('termination.title')}>
        <p>{t('termination.content')}</p>
      </LegalBlock>

      <LegalBlock id="changes" title={t('changes.title')}>
        <p>{t('changes.content')}</p>
      </LegalBlock>

      <LegalBlock id="contact" title={t('contact.title')}>
        <p>
          {t('contact.content')}{' '}
          <a className={linkClass} href={`mailto:${email}`}>
            {email}
          </a>
          .
        </p>
      </LegalBlock>
    </div>
  );
}
