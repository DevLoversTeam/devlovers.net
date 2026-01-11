import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import QaSection from '@/components/q&a/QaSection';

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
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <Suspense fallback={<>...</>}>
        <QaSection />
      </Suspense>
    </main>
  );
}
