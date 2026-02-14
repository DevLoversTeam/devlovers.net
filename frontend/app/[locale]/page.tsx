import { getTranslations } from 'next-intl/server';

import FeaturesHeroSection from '@/components/home/FeaturesHeroSection';
import HomePageScroll from '@/components/home/HomePageScroll';
import WelcomeHeroSection from '@/components/home/WelcomeHeroSection';
import Footer from '@/components/shared/Footer';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'homepage' });
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://devlovers.net';
  const canonicalUrl =
    locale === 'en' ? `${siteUrl}/en` : `${siteUrl}/${locale}`;
  const localeMap: Record<string, string> = {
    en: 'en_US',
    pl: 'pl_PL',
    uk: 'uk_UA',
  };
  const ogLocale = localeMap[locale] ?? 'en_US';

  const ogTitle = t('subtitle');

  return {
    title: t('title'),
    description: t('description'),
    alternates: {
      canonical: canonicalUrl,
      languages: {
        en: `${siteUrl}/en`,
        pl: `${siteUrl}/pl`,
        uk: `${siteUrl}/uk`,
      },
    },
    openGraph: {
      title: ogTitle,
      description: t('description'),
      url: canonicalUrl,
      siteName: 'DevLovers',
      images: [
        {
          url: '/og.png',
          width: 1200,
          height: 630,
          alt: t('ogImageAlt'),
        },
      ],
      locale: ogLocale,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description: t('description'),
      images: ['/og.png'],
    },
  };
}

export default function Home() {
  return (
    <HomePageScroll>
      <div
        data-home-step
        className="h-[calc(100dvh-4rem)] shrink-0 snap-start [scroll-snap-stop:always]"
      >
        <WelcomeHeroSection />
      </div>
      <div
        data-home-step
        className="min-h-[calc(100dvh-4rem)] shrink-0 snap-start [scroll-snap-stop:always]"
      >
        <FeaturesHeroSection />
      </div>
      <Footer forceVisible />
    </HomePageScroll>
  );
}
