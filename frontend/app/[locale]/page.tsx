import { getTranslations } from 'next-intl/server';
import HeroSection from '@/components/shared/HeroSection';

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

export default function Home() {
  return (
    <>
      <HeroSection />
    </>
  );
}
