import { getTranslations } from 'next-intl/server';

import DeliveryPolicyContent, {
  DELIVERY_POLICY_LAST_UPDATED,
} from '@/components/legal/DeliveryPolicyContent';
import LegalPageShell from '@/components/legal/LegalPageShell';
import { getLocalizedMetadata } from '@/i18n/metadata';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return getLocalizedMetadata('legal.delivery', locale);
}

export default async function DeliveryPolicyPage() {
  const t = await getTranslations('legal.delivery');

  return (
    <LegalPageShell
      title={t('title')}
      lastUpdated={DELIVERY_POLICY_LAST_UPDATED}
    >
      <DeliveryPolicyContent />
    </LegalPageShell>
  );
}
