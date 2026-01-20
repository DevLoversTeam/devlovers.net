import { getTranslations } from 'next-intl/server';
import LegalBlock from './LegalBlock';

export const PRIVACY_LAST_UPDATED = '2025-12-14';

const linkClass =
  'underline underline-offset-4 hover:text-blue-600 dark:hover:text-blue-400 transition-colors';

export default async function PrivacyPolicyContent() {
  const t = await getTranslations('legal.privacy');
  const tLegal = await getTranslations('legal');
  const email = tLegal('contactEmail');

  return (
    <div className="space-y-6">
      <LegalBlock id="who-we-are" title={t('whoWeAre.title')}>
        <p>
          {t('whoWeAre.content')}{' '}
          <a className={linkClass} href={`mailto:${email}`}>
            {email}
          </a>
          .
        </p>
      </LegalBlock>

      <LegalBlock id="data-we-collect" title={t('dataWeCollect.title')}>
        <ul className="list-disc pl-5 space-y-2">
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
        </ul>
      </LegalBlock>

      <LegalBlock id="why-we-collect" title={t('whyWeCollect.title')}>
        <ul className="list-disc pl-5 space-y-2">
          <li>{t('whyWeCollect.reason1')}</li>
          <li>{t('whyWeCollect.reason2')}</li>
          <li>{t('whyWeCollect.reason3')}</li>
        </ul>
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
          {t('rights.content')}{' '}
          <a className={linkClass} href={`mailto:${email}`}>
            {email}
          </a>
          .
        </p>
      </LegalBlock>

      <LegalBlock id="gdpr" title={t('gdpr.title')}>
        <p className="mb-4">{t('gdpr.intro')}</p>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>{t('gdpr.rightAccess')}</strong> {t('gdpr.rightAccessDesc')}
          </li>
          <li>
            <strong>{t('gdpr.rightRectification')}</strong>{' '}
            {t('gdpr.rightRectificationDesc')}
          </li>
          <li>
            <strong>{t('gdpr.rightErasure')}</strong> {t('gdpr.rightErasureDesc')}
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
        </ul>
        <p className="mt-4">
          {t('gdpr.exerciseRights')}{' '}
          <a className={linkClass} href={`mailto:${email}`}>
            {email}
          </a>
          . {t('gdpr.response')}
        </p>
      </LegalBlock>

      <LegalBlock id="changes" title={t('changes.title')}>
        <p>{t('changes.content')}</p>
      </LegalBlock>
    </div>
  );
}
