import { getTranslations } from 'next-intl/server';

import HeroSection from '@/components/home/HeroSection';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'homepage' });
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://devlovers.net';
  const localeMap: Record<string, string> = {
    en: 'en_US',
    pl: 'pl_PL',
    uk: 'uk_UA',
  };
  const ogLocale = localeMap[locale] ?? 'en_US';

  return {
    title: t('title'),
    description: t('description'),
    openGraph: {
      title: t('title'),
      description: t('description'),
      url: siteUrl,
      siteName: 'DevLovers',
      images: [
        {
          url: '/og.png',
          width: 1200,
          height: 630,
          alt: 'DevLovers — Technical Interview Platform',
        },
      ],
      locale: ogLocale,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: t('title'),
      description: t('description'),
      images: ['/og.png'],
    },
  };
}

export default function Home() {
  return (
    <>
      <HeroSection />
    </>
  );
}
