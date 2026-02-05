import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

import QaSection from '@/components/q&a/QaSection';
import { DynamicGridBackground } from '@/components/shared/DynamicGridBackground';

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

export default async function QAPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'qa' });

  return (
    <div className="min-h-screen">
      <DynamicGridBackground className="bg-gray-50 py-10 transition-colors duration-300 dark:bg-transparent">
        <main className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <p className="text-sm font-semibold text-(--accent-primary)">
              {t('pretitle')}
            </p>
            <h1 className="text-3xl font-bold">{t('title')}</h1>
            <p className="text-gray-600 dark:text-gray-400">{t('subtitle')}</p>
          </div>
          <Suspense fallback={<>...</>}>
            <QaSection />
          </Suspense>
        </main>
      </DynamicGridBackground>
    </div>
  );
}
