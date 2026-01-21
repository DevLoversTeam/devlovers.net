import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
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
    <DynamicGridBackground className="bg-gray-50 transition-colors duration-300 dark:bg-transparent py-10">
      <main className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <p className="text-sm text-[var(--accent-primary)] font-semibold">
            {t('pretitle')}
          </p>
          <h1 className="text-3xl font-bold">{t('title')}</h1>
          <p className="text-gray-600 dark:text-gray-400">
            {t('subtitle')}
          </p>
        </div>
        <Suspense fallback={<>...</>}>
          <QaSection />
        </Suspense>
      </main>
    </DynamicGridBackground>
  );
}
