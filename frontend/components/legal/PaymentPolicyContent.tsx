import { getTranslations } from 'next-intl/server';

import { LegalEmailLink } from '@/components/legal/LegalEmailLink';
import { LegalList } from '@/components/legal/LegalList';
import { getPublicSupportEmail } from '@/lib/legal/public-contact';

import LegalBlock from './LegalBlock';

export const PAYMENT_POLICY_LAST_UPDATED = '2026-03-27';

export default async function PaymentPolicyContent() {
  const t = await getTranslations('legal.payment');
  const email = getPublicSupportEmail();

  return (
    <div className="space-y-6">
      <LegalBlock id="methods" title={t('methods.title')}>
        <p className="mb-4">{t('methods.body')}</p>
        <LegalList>
          <li>{t('methods.items.stripe')}</li>
          <li>{t('methods.items.monobank')}</li>
        </LegalList>
      </LegalBlock>

      <LegalBlock id="confirmation" title={t('confirmation.title')}>
        <p>{t('confirmation.body')}</p>
      </LegalBlock>

      <LegalBlock id="charges" title={t('charges.title')}>
        <p>{t('charges.body')}</p>
      </LegalBlock>

      <LegalBlock id="support" title={t('support.title')}>
        <p>
          {t('support.body')} <LegalEmailLink email={email} />.
        </p>
      </LegalBlock>
    </div>
  );
}
