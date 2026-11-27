import { getTranslations } from 'next-intl/server';

import { LegalEmailLink } from '@/components/legal/LegalEmailLink';
import { LegalList } from '@/components/legal/LegalList';
import { getPublicSupportEmail } from '@/lib/legal/public-contact';

import LegalBlock from './LegalBlock';

export const DELIVERY_POLICY_LAST_UPDATED = '2026-03-27';

export default async function DeliveryPolicyContent() {
  const t = await getTranslations('legal.delivery');
  const email = getPublicSupportEmail();

  return (
    <div className="space-y-6">
      <LegalBlock id="methods" title={t('methods.title')}>
        <p className="mb-4">{t('methods.body')}</p>
        <LegalList>
          <li>{t('methods.items.warehouse')}</li>
          <li>{t('methods.items.locker')}</li>
          <li>{t('methods.items.courier')}</li>
        </LegalList>
      </LegalBlock>

      <LegalBlock id="availability" title={t('availability.title')}>
        <p>{t('availability.body')}</p>
      </LegalBlock>

      <LegalBlock id="timing" title={t('timing.title')}>
        <p>{t('timing.body')}</p>
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
