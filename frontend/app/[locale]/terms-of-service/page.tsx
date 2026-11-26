import { getTranslations } from 'next-intl/server';

import LegalPageShell from '@/components/legal/LegalPageShell';
import TermsOfServiceContent, {
  TERMS_LAST_UPDATED,
} from '@/components/legal/TermsOfServiceContent';
import { getLocalizedMetadata } from '@/i18n/metadata';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return getLocalizedMetadata('legal.terms', locale);
}

export default async function TermsOfServicePage() {
  const t = await getTranslations('legal.terms');

  return (
    <LegalPageShell title={t('title')} lastUpdated={TERMS_LAST_UPDATED}>
      <TermsOfServiceContent />
    </LegalPageShell>
  );
}
