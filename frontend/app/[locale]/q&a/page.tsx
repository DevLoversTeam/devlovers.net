import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import TabsSection from '@/components/shared/TabsSection';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'qa' });

  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
  };
}

export default function QAPage() {
  return (
    <main className="max-w-3xl mx-auto py-10">
      <Suspense fallback={<>...</>}>
        <TabsSection />
      </Suspense>
    </main>
  );
}
