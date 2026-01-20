import { getTranslations } from 'next-intl/server';
import LegalPageShell from '@/components/legal/LegalPageShell';
import TermsOfServiceContent, {
  TERMS_LAST_UPDATED,
} from '@/components/legal/TermsOfServiceContent';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'legal.terms' });

  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
  };
}

export default async function TermsOfServicePage() {
  const t = await getTranslations('legal.terms');

  return (
    <LegalPageShell title={t('title')} lastUpdated={TERMS_LAST_UPDATED}>
      <TermsOfServiceContent />
    </LegalPageShell>
  );
}
