import { getTranslations } from 'next-intl/server';

import { getPublicSupportEmail } from '@/lib/legal/public-contact';

import LegalBlock from './LegalBlock';

export const DELIVERY_POLICY_LAST_UPDATED = '2026-03-27';

const linkClass =
  'underline underline-offset-4 hover:text-blue-600 dark:hover:text-blue-400 transition-colors';

export default async function DeliveryPolicyContent() {
  const t = await getTranslations('legal.delivery');
  const email = getPublicSupportEmail();

  return (
    <div className="space-y-6">
      <LegalBlock id="methods" title={t('methods.title')}>
        <p className="mb-4">{t('methods.body')}</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>{t('methods.items.warehouse')}</li>
          <li>{t('methods.items.locker')}</li>
          <li>{t('methods.items.courier')}</li>
        </ul>
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
          {t('support.body')}{' '}
          <a className={linkClass} href={`mailto:${email}`}>
            {email}
          </a>
          .
        </p>
      </LegalBlock>
    </div>
  );
}
