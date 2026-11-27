import { getTranslations } from 'next-intl/server';

import { LegalEmailLink } from '@/components/legal/LegalEmailLink';
import { getPublicSupportEmail } from '@/lib/legal/public-contact';

import LegalBlock from './LegalBlock';

export const RETURNS_POLICY_LAST_UPDATED = '2026-03-27';

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
          {t('contact.body')} <LegalEmailLink email={email} />.
        </p>
      </LegalBlock>
    </div>
  );
}
