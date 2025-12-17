import { HeroSection } from "@/components/about/HeroSection"
import { FeaturesSection } from "@/components/about/FeaturesSection"
import { PricingSection } from "@/components/about/PricingSection"
import { CommunitySection } from "@/components/about/CommunitySection"

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <HeroSection />
      <FeaturesSection />
      <PricingSection />
      <CommunitySection />
    </main>
  )
}
