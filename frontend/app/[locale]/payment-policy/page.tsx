import { getTranslations } from 'next-intl/server';

import LegalPageShell from '@/components/legal/LegalPageShell';
import PaymentPolicyContent, {
  PAYMENT_POLICY_LAST_UPDATED,
} from '@/components/legal/PaymentPolicyContent';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'legal.payment' });

  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
  };
}

export default async function PaymentPolicyPage() {
  const t = await getTranslations('legal.payment');

  return (
    <LegalPageShell
      title={t('title')}
      lastUpdated={PAYMENT_POLICY_LAST_UPDATED}
    >
      <PaymentPolicyContent />
    </LegalPageShell>
  );
}
