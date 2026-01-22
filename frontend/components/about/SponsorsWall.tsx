"use client"

import { motion } from "framer-motion"
import Image from "next/image"
import Link from "next/link"
import { Plus, Crown, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Sponsor } from "@/lib/about/github-sponsors"

interface SponsorsWallProps {
  sponsors?: Sponsor[]
}

const MAX_SPONSORS = 10

export function SponsorsWall({ sponsors = [] }: SponsorsWallProps) {
  const displaySponsors = sponsors.slice(0, MAX_SPONSORS)

  return (
    <div className="w-full mt-16 flex flex-col items-center">
      <div className="flex items-center gap-2 mb-4 opacity-60">
        <Sparkles size={10} className="text-[#1e5eff] dark:text-[#ff2d55]" />
        <span className="text-[10px] font-mono uppercase tracking-widest text-gray-500">
           Latest Contributors
        </span>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="group relative flex items-center p-2 rounded-full border border-gray-200 dark:border-white/10 bg-white/60 dark:bg-[#0a0a0a]/60 backdrop-blur-xl shadow-sm hover:shadow-lg hover:border-[#1e5eff]/20 dark:hover:border-[#ff2d55]/20 transition-all duration-300"
      >
        <div className="flex -space-x-3 md:-space-x-4 pl-2">
            {displaySponsors.map((sponsor) => (
                <SponsorItem key={sponsor.login} sponsor={sponsor} />
            ))}

             {displaySponsors.length === 0 && (
                <div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-white/5 border-2 border-white dark:border-black flex items-center justify-center">
                    <span className="text-[8px] text-gray-400">You?</span>
                </div>
             )}
        </div>

        <div className="h-6 w-[1px] bg-gray-200 dark:bg-white/10 mx-4" />

        <Link 
            href="https://github.com/sponsors/DevLoversTeam" 
            target="_blank"
            className="relative flex items-center justify-center w-10 h-10 rounded-full border-2 border-dashed border-gray-300 dark:border-white/20 hover:border-[#1e5eff] dark:hover:border-[#ff2d55] bg-transparent hover:bg-[#1e5eff]/5 dark:hover:bg-[#ff2d55]/5 transition-all group/cta"
        >
            <Plus size={16} className="text-gray-400 group-hover/cta:text-[#1e5eff] dark:group-hover/cta:text-[#ff2d55] transition-colors" />
            
            <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 px-2 py-1 bg-[#1e5eff] dark:bg-[#ff2d55] text-white text-[10px] font-bold rounded opacity-0 group-hover/cta:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                Your Spot
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#1e5eff] dark:border-t-[#ff2d55]" />
            </div>
        </Link>

        <Link href="https://github.com/sponsors/DevLoversTeam" target="_blank" className="hidden sm:block ml-3 mr-2 text-xs font-bold text-gray-500 hover:text-[#1e5eff] dark:hover:text-[#ff2d55] transition-colors">
            Join the club
        </Link>

      </motion.div>

      <p className="mt-4 text-[10px] text-gray-400 font-mono">
         100% of funds go to server costs & coffee
      </p>

    </div>
  )
}

function SponsorItem({ sponsor }: { sponsor: Sponsor }) {
  const ringColor = sponsor.tierColor === 'gold' ? 'ring-[#1e5eff] dark:ring-[#ff2d55]' : 
                    sponsor.tierColor === 'silver' ? 'ring-gray-400' : 'ring-orange-700/50'

  return (
    <Link 
        href={`https://github.com/${sponsor.login}`}
        target="_blank"
        className="group/avatar relative z-0 hover:z-10 transition-transform duration-200 hover:-translate-y-2 hover:scale-110"
    >
        <div className={cn(
            "relative w-9 h-9 md:w-11 md:h-11 rounded-full border-[3px] overflow-hidden bg-gray-100 dark:bg-[#111] transition-all",
            "border-white dark:border-black", 
            (sponsor.tierColor === 'gold' || sponsor.tierColor === 'silver') && `ring-2 ${ringColor} ring-offset-0`
        )}>
            <Image src={sponsor.avatarUrl} alt={sponsor.login} fill className="object-cover" />
            
            {sponsor.tierColor === 'gold' && (
                 <div className="absolute inset-0 bg-black/10 flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity">
                    <Crown size={12} className="text-white fill-white" />
                 </div>
            )}
        </div>

        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-gray-900 dark:bg-white text-white dark:text-black text-[10px] font-bold rounded-lg opacity-0 group-hover/avatar:opacity-100 transition-all duration-200 pointer-events-none whitespace-nowrap shadow-xl transform translate-y-1 group-hover/avatar:translate-y-0 z-20">
            <span className="text-gray-300 dark:text-gray-500 font-normal">@{sponsor.login}</span>
            <span className="mx-1.5 opacity-30">|</span>
            <span className={cn(
                "capitalize",
                sponsor.tierColor === 'gold' ? "text-[#1e5eff] dark:text-[#ff2d55]" : "text-white dark:text-black"
            )}>
                {sponsor.tierName}
            </span>
        </div>
    </Link>
  )
}