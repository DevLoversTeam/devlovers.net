import { getTranslations } from 'next-intl/server';

import LegalPageShell from '@/components/legal/LegalPageShell';
import PrivacyPolicyContent, {
  PRIVACY_LAST_UPDATED,
} from '@/components/legal/PrivacyPolicyContent';
import { getLocalizedMetadata } from '@/i18n/metadata';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return getLocalizedMetadata('legal.privacy', locale);
}

export default async function PrivacyPolicyPage() {
  const t = await getTranslations('legal.privacy');

  return (
    <LegalPageShell title={t('title')} lastUpdated={PRIVACY_LAST_UPDATED}>
      <PrivacyPolicyContent />
    </LegalPageShell>
  );
}
