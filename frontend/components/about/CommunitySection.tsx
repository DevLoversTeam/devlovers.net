"use client"

import { MessageCircle, Github, ArrowRight, ExternalLink } from "lucide-react"
import { TESTIMONIALS, type Testimonial } from "@/data/about" 

import Link from "next/link"

export function CommunitySection() {
  return (
    <section className="w-full py-16 md:py-24 relative overflow-hidden bg-gray-50 dark:bg-transparent">
        
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-[#1e5eff]/5 dark:bg-[#ff2d55]/5 blur-[80px] rounded-full pointer-events-none" />

        <div className="w-full relative z-10">
            
            <div className="max-w-7xl mx-auto px-4 mb-12 text-center">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-500 dark:text-gray-400 text-[10px] font-bold uppercase tracking-widest mb-4">
                    <MessageCircle size={10} /> Community Love
                </div>
                
                <h2 className="text-3xl md:text-4xl font-black tracking-tight text-gray-900 dark:text-white mb-4">
                    Approved by <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#1e5eff] to-[#174ad6] dark:from-[#ff2d55] dark:to-[#e0264b]">Survivors</span>
                </h2>
                <p className="text-gray-600 dark:text-gray-400 max-w-xl mx-auto text-base font-light leading-relaxed">
                    Join thousands of developers who stopped guessing and started shipping. Real feedback from real engineers.
                </p>
            </div>

            <div className="relative w-full pause-on-hover mb-16">
                
                <div className="pointer-events-none absolute left-0 top-0 z-10 h-full w-12 md:w-32 bg-gradient-to-r from-gray-50 dark:from-background to-transparent" />
                <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-12 md:w-32 bg-gradient-to-l from-gray-50 dark:from-background to-transparent" />

                <div className="flex w-max min-w-full">
                    <div className="flex shrink-0 gap-4 px-2 animate-scroll">
                        {TESTIMONIALS.map((testimonial, index) => (
                            <TestimonialCard key={`loop1-${index}`} {...testimonial} />
                        ))}
                    </div>
                    <div className="flex shrink-0 gap-4 px-2 animate-scroll" aria-hidden="true">
                        {TESTIMONIALS.map((testimonial, index) => (
                            <TestimonialCard key={`loop2-${index}`} {...testimonial} />
                        ))}
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 text-center">
                <div className="flex flex-col items-center gap-3 md:hidden">
                    <span className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                        Have a success story or feature request?
                    </span>
                    <Link
                        href="https://github.com/DevLoversTeam/devlovers.net/discussions"
                        target="_blank"
                        className="group inline-flex items-center gap-2 px-5 py-3 rounded-full
                            bg-gray-900 dark:bg-white text-white dark:text-black
                            text-xs font-bold uppercase tracking-wider
                            transition-all duration-300
                            hover:bg-[#1e5eff] dark:hover:bg-[#ff2d55]
                            hover:text-white dark:hover:text-white
                            hover:scale-[1.02]"
                    >
                        <Github size={14} />
                        Join Discussion
                        <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform" />
                    </Link>
                </div>

                <Link
                    href="https://github.com/DevLoversTeam/devlovers.net/discussions"
                    target="_blank"
                    className="group relative hidden md:inline-flex items-center justify-center gap-4 p-1.5 pl-6 pr-1.5 rounded-full
                    bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10
                    transition-all duration-300 ease-out
                    hover:scale-[1.02]
                    hover:border-[#1e5eff]/50 dark:hover:border-[#ff2d55]/50
                    hover:shadow-[0_0_30px_-5px_rgba(30,94,255,0.15)] dark:hover:shadow-[0_0_30px_-5px_rgba(255,45,85,0.15)]"
                >
                    <span className="text-sm text-gray-700 dark:text-gray-200 font-medium">
                        Have a success story or feature request?
                    </span>

                    <span className="flex items-center gap-2 px-5 py-2.5 rounded-full
                        bg-gray-900 dark:bg-white text-white dark:text-black
                        text-xs font-bold uppercase tracking-wider
                        transition-all duration-300
                        group-hover:bg-[#1e5eff] dark:group-hover:bg-[#ff2d55]
                        group-hover:text-white dark:group-hover:text-white"
                    >
                        <Github size={14} />
                        Join Discussion
                        <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform" />
                    </span>
                </Link>

                <p className="mt-6 text-[10px] text-gray-400 dark:text-gray-600 uppercase tracking-widest font-bold opacity-60">
                    We read every single thread
                </p>
            </div>

      </div>
    </section>
  )
}

function TestimonialCard({
  name,
  role,
  avatar,
  content,
  platform,
  icon: Icon,
  color
}: Testimonial) {
  return (
    <div className="w-[280px] md:w-[320px] shrink-0 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#0f0f0f] p-5 shadow-sm hover:shadow-md transition-all duration-300 hover:border-gray-300 dark:hover:border-white/20 hover:-translate-y-1">
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 dark:bg-white/10 border border-gray-200 dark:border-white/5 text-xs font-bold text-gray-700 dark:text-gray-200">
            {avatar}
          </div>
          <div>
            <div className="font-bold text-gray-900 dark:text-white text-sm leading-none mb-1">{name}</div>
            <div className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">{role}</div>
          </div>
        </div>

        <div className={`flex h-7 w-7 items-center justify-center rounded-full ${color}`}>
          <Icon size={12} />
        </div>
      </div>

      <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300 font-normal">
        &quot;{content}&quot;
      </p>

      <div className="mt-3 text-[10px] text-gray-400 dark:text-gray-600 font-mono flex items-center gap-1">
        via {platform} <ExternalLink size={8} />
      </div>
    </div>
  )
}