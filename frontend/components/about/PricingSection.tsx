"use client"
import { useState } from "react"
import { motion } from "framer-motion"
import { Check, Heart, X, Sparkles, Server, ArrowRight } from "lucide-react"
import Link from "next/link"
import type { Sponsor } from "@/lib/about/github-sponsors" 
import { SponsorsWall } from "./SponsorsWall"
import { GradientBadge } from "@/components/ui/gradient-badge"
import { SectionHeading } from "@/components/ui/section-heading"
import { ParticleCanvas } from "@/components/ui/particle-canvas"
interface PricingSectionProps {
  sponsors?: Sponsor[]
}

export function PricingSection({ sponsors = [] }: PricingSectionProps) {
    const [activeShape, setActiveShape] = useState<"brackets" | "heart" | null>(null)

    return (
        <section className="w-full py-20 lg:py-28 relative overflow-hidden bg-gray-50 dark:bg-transparent" aria-labelledby="pricing-heading">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#1e5eff]/5 dark:bg-[#ff2d55]/5 blur-[100px] rounded-full pointer-events-none" aria-hidden="true" />
            
            <div className="absolute inset-0 pointer-events-none z-0">
                <ParticleCanvas activeShape={activeShape} className="w-full h-full" />
            </div>

            <div className="container-main relative z-10">
                <div className="text-center mb-16">
                    <motion.div 
                        initial={{ opacity: 0, y: 10 }} 
                        whileInView={{ opacity: 1, y: 0 }}
                    >
                        <h2 id="pricing-heading" className="sr-only">Pricing</h2>
                        <GradientBadge icon={Sparkles} text="No Hidden Fees" className="mb-4" />
                    </motion.div>
                    
                    <SectionHeading 
                        title="Invest in your brain,"
                        highlight="not our subscriptions."
                        subtitle="We believe knowledge should be accessible. So we don't sell courses. But servers heat up and coffee runs out. The choice is yours."
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-12 max-w-4xl mx-auto mb-6">
                    
                    <motion.div 
                        whileHover={{ y: -5 }}
                        onMouseEnter={() => setActiveShape("brackets")}
                        onMouseLeave={() => setActiveShape(null)}
                        onFocus={() => setActiveShape("brackets")}
                        onBlur={() => setActiveShape(null)}
                        className="flex flex-col p-8 lg:p-10 rounded-3xl border border-gray-200 dark:border-neutral-800 bg-white/10 dark:bg-neutral-900/10 backdrop-blur-md shadow-sm relative z-10"
                    >
                        <div className="mb-6">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Junior Engineer</h3>
                            <p className="text-sm text-gray-600 dark:text-neutral-400">For those who want an offer, not expenses.</p>
                        </div>
                        <div className="mb-8">
                            <span className="text-4xl lg:text-5xl font-black text-gray-900 dark:text-white">$0</span>
                            <span className="text-gray-500 dark:text-neutral-500 font-mono text-sm ml-2">/ forever</span>
                        </div>
                        
                        <ul className="space-y-4 mb-8 flex-1">
                            {[
                                "Unlimited Questions",
                                "Full Quiz Access",
                                "No Credit Card Required",
                                "0% Guilt Trip",
                            ].map((item) => (
                                <li key={item} className="flex items-center gap-3 text-sm text-gray-700 dark:text-neutral-300">
                                    <div className="p-1 rounded-full bg-green-500/10 text-green-500" aria-hidden="true">
                                        <Check size={12} />
                                    </div>
                                    {item}
                                </li>
                            ))}
                             <li className="flex items-center gap-3 text-sm text-gray-400 dark:text-neutral-500 line-through decoration-gray-300 dark:decoration-neutral-700">
                                    <div className="p-1 rounded-full bg-gray-100 dark:bg-neutral-800 text-gray-400 dark:text-neutral-600" aria-hidden="true">
                                        <X size={12} />
                                    </div>
                                    Personal Yacht
                                </li>
                        </ul>

                        <Link href="/" className="w-full py-4 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 text-gray-900 dark:text-white font-bold text-center transition-all uppercase tracking-widest text-xs">
                            Start Learning
                        </Link>
                    </motion.div>

                    <motion.div 
                        whileHover={{ y: -5 }}
                        onMouseEnter={() => setActiveShape("heart")}
                        onMouseLeave={() => setActiveShape(null)}
                        onFocus={() => setActiveShape("heart")}
                        onBlur={() => setActiveShape(null)}
                        className="relative flex flex-col p-8 lg:p-10 rounded-3xl overflow-hidden backdrop-blur-md z-10
                            border border-[#1e5eff]/30 dark:border-[#ff2d55]/30
                            bg-gradient-to-b from-[#1e5eff]/5 to-white/10 dark:from-[#ff2d55]/10 dark:to-neutral-900/10"
                    >
                        <div className="absolute top-0 right-0 px-3 py-1 rounded-bl-xl uppercase tracking-widest text-[10px] font-bold text-white
                            bg-[#1e5eff] dark:bg-[#ff2d55]"
                        >
                            High Impact
                        </div>

                        <div className="mb-6">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                                Open Source Hero 
                                <Heart size={18} className="fill-[#1e5eff] text-[#1e5eff] dark:fill-[#ff2d55] dark:text-[#ff2d55]" aria-label="Supporter" />
                            </h3>
                            <p className="text-sm text-neutral-500 dark:text-neutral-400">For those who already landed an offer thanks to us.</p>
                        </div>
                        <div className="mb-8">
                            <span className="text-4xl lg:text-5xl font-black text-[#1e5eff] dark:text-[#ff2d55]">$$$</span>
                            <span className="text-neutral-500 font-mono text-sm ml-2">/ karma points</span>
                        </div>
                        
                        <ul className="space-y-4 mb-8 flex-1">
                            {[
                                "Keep Servers Alive",
                                "Buy Coffee for Developers",
                                "Profile Badge (Big Flex)",
                                "Warm Fuzzy Feeling",
                            ].map((item) => (
                                <li key={item} className="flex items-center gap-3 text-sm text-gray-900 dark:text-white font-medium">
                                    <div className="p-1 rounded-full bg-[#1e5eff]/20 text-[#1e5eff] dark:bg-[#ff2d55]/20 dark:text-[#ff2d55]" aria-hidden="true">
                                        <Sparkles size={12} />
                                    </div>
                                    {item}
                                </li>
                            ))}
                            <li className="flex items-center gap-3 text-sm text-gray-600 dark:text-neutral-400 italic">
                                    <div className="p-1 rounded-full bg-gray-200 dark:bg-neutral-800 text-gray-500 dark:text-neutral-500" aria-hidden="true">
                                        <Server size={12} />
                                    </div>
                                    We actually pay for Drizzle
                                </li>
                        </ul>

                        <Link 
                            href="https://github.com/sponsors/DevLoversTeam" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="group w-full py-4 rounded-xl text-white font-bold flex items-center justify-center gap-2 transition-all uppercase tracking-widest text-xs
                                bg-[#1e5eff] hover:bg-[#1e5eff]/90 shadow-[0_0_20px_rgba(30,94,255,0.3)] hover:shadow-[0_0_30px_rgba(30,94,255,0.5)]
                                dark:bg-[#ff2d55] dark:hover:bg-[#ff2d55]/90 dark:shadow-[0_0_20px_rgba(255,45,85,0.3)] dark:hover:shadow-[0_0_30px_rgba(255,45,85,0.5)]"
                        >
                            Support the Project <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" aria-hidden="true" />
                        </Link>
                    </motion.div>

                </div>
                
                <p className="text-center text-gray-400 dark:text-neutral-600 text-[10px] mb-16 font-mono max-w-lg mx-auto leading-relaxed">
                    *No developers were harmed in the making of this pricing table. Only caffeine levels were impacted.
                </p>

                <SponsorsWall sponsors={sponsors} />
                
            </div>
        </section>
    )
}