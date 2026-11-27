import { getTranslations } from 'next-intl/server';

import { LegalEmailLink } from '@/components/legal/LegalEmailLink';
import { LegalList } from '@/components/legal/LegalList';
import { getPublicSupportEmail } from '@/lib/legal/public-contact';

import LegalBlock from './LegalBlock';

export const PRIVACY_LAST_UPDATED = '2025-12-14';

export default async function PrivacyPolicyContent() {
  const t = await getTranslations('legal.privacy');
  const email = getPublicSupportEmail();

  return (
    <div className="space-y-6">
      <LegalBlock id="who-we-are" title={t('whoWeAre.title')}>
        <p>
          {t('whoWeAre.content')} <LegalEmailLink email={email} />.
        </p>
      </LegalBlock>

      <LegalBlock id="data-we-collect" title={t('dataWeCollect.title')}>
        <LegalList>
          <li>
            <strong>{t('dataWeCollect.accountData')}</strong>{' '}
            {t('dataWeCollect.accountDataDesc')}
          </li>
          <li>
            <strong>{t('dataWeCollect.usageData')}</strong>{' '}
            {t('dataWeCollect.usageDataDesc')}
          </li>
          <li>
            <strong>{t('dataWeCollect.technicalData')}</strong>{' '}
            {t('dataWeCollect.technicalDataDesc')}
          </li>
        </LegalList>
      </LegalBlock>

      <LegalBlock id="why-we-collect" title={t('whyWeCollect.title')}>
        <LegalList>
          <li>{t('whyWeCollect.reason1')}</li>
          <li>{t('whyWeCollect.reason2')}</li>
          <li>{t('whyWeCollect.reason3')}</li>
        </LegalList>
      </LegalBlock>

      <LegalBlock id="cookies" title={t('cookies.title')}>
        <p>{t('cookies.content')}</p>
      </LegalBlock>

      <LegalBlock id="sharing" title={t('sharing.title')}>
        <p>{t('sharing.content')}</p>
      </LegalBlock>

      <LegalBlock id="retention" title={t('retention.title')}>
        <p>{t('retention.content')}</p>
      </LegalBlock>

      <LegalBlock id="rights" title={t('rights.title')}>
        <p>
          {t('rights.content')} <LegalEmailLink email={email} />.
        </p>
      </LegalBlock>

      <LegalBlock id="gdpr" title={t('gdpr.title')}>
        <p className="mb-4">{t('gdpr.intro')}</p>
        <LegalList>
          <li>
            <strong>{t('gdpr.rightAccess')}</strong> {t('gdpr.rightAccessDesc')}
          </li>
          <li>
            <strong>{t('gdpr.rightRectification')}</strong>{' '}
            {t('gdpr.rightRectificationDesc')}
          </li>
          <li>
            <strong>{t('gdpr.rightErasure')}</strong>{' '}
            {t('gdpr.rightErasureDesc')}
          </li>
          <li>
            <strong>{t('gdpr.rightRestriction')}</strong>{' '}
            {t('gdpr.rightRestrictionDesc')}
          </li>
          <li>
            <strong>{t('gdpr.rightPortability')}</strong>{' '}
            {t('gdpr.rightPortabilityDesc')}
          </li>
          <li>
            <strong>{t('gdpr.rightObject')}</strong> {t('gdpr.rightObjectDesc')}
          </li>
        </LegalList>
        <p className="mt-4">
          {t('gdpr.exerciseRights')} <LegalEmailLink email={email} />.{' '}
          {t('gdpr.response')}
        </p>
      </LegalBlock>

      <LegalBlock id="changes" title={t('changes.title')}>
        <p>{t('changes.content')}</p>
      </LegalBlock>
    </div>
  );
}
