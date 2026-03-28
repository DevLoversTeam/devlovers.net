import { getTranslations } from 'next-intl/server';

import { getPublicSupportEmail } from '@/lib/legal/public-contact';

import LegalBlock from './LegalBlock';

export const PAYMENT_POLICY_LAST_UPDATED = '2026-03-27';

const linkClass =
  'underline underline-offset-4 hover:text-blue-600 dark:hover:text-blue-400 transition-colors';

export default async function PaymentPolicyContent() {
  const t = await getTranslations('legal.payment');
  const email = getPublicSupportEmail();

  return (
    <div className="space-y-6">
      <LegalBlock id="methods" title={t('methods.title')}>
        <p className="mb-4">{t('methods.body')}</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>{t('methods.items.stripe')}</li>
          <li>{t('methods.items.monobank')}</li>
        </ul>
      </LegalBlock>

      <LegalBlock id="confirmation" title={t('confirmation.title')}>
        <p>{t('confirmation.body')}</p>
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
