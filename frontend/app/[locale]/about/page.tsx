import { getPlatformStats } from "@/lib/about/stats"
import { getSponsors } from "@/lib/about/github-sponsors"

import { HeroSection } from "@/components/about/HeroSection"
import { TopicsSection } from "@/components/about/TopicsSection"
import { FeaturesSection } from "@/components/about/FeaturesSection"
import { PricingSection } from "@/components/about/PricingSection"
import { CommunitySection } from "@/components/about/CommunitySection"

export default async function AboutPage() {
  const [stats, sponsors] = await Promise.all([
    getPlatformStats(),
    getSponsors()
  ])

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-black overflow-hidden text-gray-900 dark:text-white
      w-[100vw] relative left-[50%] right-[50%] -ml-[50vw] -mr-[50vw]"
    >
      
      <HeroSection stats={stats} />
      <TopicsSection />
      <FeaturesSection />
      <PricingSection sponsors={sponsors} />
      <CommunitySection />
      
    </main>
  )
}