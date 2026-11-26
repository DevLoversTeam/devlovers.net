import { getTranslations } from 'next-intl/server';

import LegalPageShell from '@/components/legal/LegalPageShell';
import SellerInformationContent, {
  SELLER_INFORMATION_LAST_UPDATED,
} from '@/components/legal/SellerInformationContent';
import { getLocalizedMetadata } from '@/i18n/metadata';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return getLocalizedMetadata('legal.seller', locale);
}

export default async function SellerInformationPage() {
  const t = await getTranslations('legal.seller');

  return (
    <LegalPageShell
      title={t('title')}
      lastUpdated={SELLER_INFORMATION_LAST_UPDATED}
    >
      <SellerInformationContent />
    </LegalPageShell>
  );
}
