import { getTranslations } from 'next-intl/server';

import DeliveryPolicyContent, {
  DELIVERY_POLICY_LAST_UPDATED,
} from '@/components/legal/DeliveryPolicyContent';
import LegalPageShell from '@/components/legal/LegalPageShell';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'legal.delivery' });

  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
  };
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
