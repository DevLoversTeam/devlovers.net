import { getTranslations } from 'next-intl/server';

import { CommunitySection } from '@/components/about/CommunitySection';
import { FeaturesSection } from '@/components/about/FeaturesSection';
import { HeroSection } from '@/components/about/HeroSection';
import { PricingSection } from '@/components/about/PricingSection';
import { TopicsSection } from '@/components/about/TopicsSection';
import { getSponsors } from '@/lib/about/github-sponsors';
import { getPlatformStats } from '@/lib/about/stats';

export async function generateMetadata() {
  const t = await getTranslations('about');
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
  };
}

export default async function AboutPage() {
  const [stats, sponsors] = await Promise.all([
    getPlatformStats(),
    getSponsors(),
  ]);

  return (
    <main className="relative right-[50%] left-[50%] -mr-[50vw] -ml-[50vw] min-h-screen w-[100vw] overflow-hidden bg-gray-50 text-gray-900 dark:bg-black dark:text-white">
      <HeroSection stats={stats} />
      <TopicsSection />
      <FeaturesSection />
      <PricingSection sponsors={sponsors} />
      <CommunitySection />
    </main>
  );
}
