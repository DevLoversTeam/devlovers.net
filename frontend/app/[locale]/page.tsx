import { getTranslations } from 'next-intl/server';

import FeaturesHeroSection from '@/components/home/FeaturesHeroSection';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'homepage' });

  return {
    title: `${t('title')} | DevLovers`,
    description: t('description'),
  };
}

import WelcomeHeroSection from '@/components/home/WelcomeHeroSection';

export default function Home() {
  return (
    <>
      <WelcomeHeroSection />
      <FeaturesHeroSection />
    </>
  );
}
