import { getTranslations } from 'next-intl/server';

import LegalPageShell from '@/components/legal/LegalPageShell';
import ReturnsPolicyContent, {
  RETURNS_POLICY_LAST_UPDATED,
} from '@/components/legal/ReturnsPolicyContent';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'legal.returns' });

  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
  };
}

export default async function ReturnsPolicyPage() {
  const t = await getTranslations('legal.returns');

  return (
    <LegalPageShell title={t('title')} lastUpdated={RETURNS_POLICY_LAST_UPDATED}>
      <ReturnsPolicyContent />
    </LegalPageShell>
  );
}
