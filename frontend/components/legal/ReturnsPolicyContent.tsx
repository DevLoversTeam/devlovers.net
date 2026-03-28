import { getTranslations } from 'next-intl/server';

import { getPublicSupportEmail } from '@/lib/legal/public-contact';

import LegalBlock from './LegalBlock';

export const RETURNS_POLICY_LAST_UPDATED = '2026-03-27';

const linkClass =
  'underline underline-offset-4 hover:text-blue-600 dark:hover:text-blue-400 transition-colors';

export default async function ReturnsPolicyContent() {
  const t = await getTranslations('legal.returns');
  const email = getPublicSupportEmail();

  return (
    <div className="space-y-6">
      <LegalBlock id="request" title={t('request.title')}>
        <p>{t('request.body')}</p>
      </LegalBlock>

      <LegalBlock id="review" title={t('review.title')}>
        <p>{t('review.body')}</p>
      </LegalBlock>

      <LegalBlock id="refunds" title={t('refunds.title')}>
        <p>{t('refunds.body')}</p>
      </LegalBlock>

      <LegalBlock id="contact" title={t('contact.title')}>
        <p>
          {t('contact.body')}{' '}
          <a className={linkClass} href={`mailto:${email}`}>
            {email}
          </a>
          .
        </p>
      </LegalBlock>
    </div>
  );
}
