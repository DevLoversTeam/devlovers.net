"use client"

import { useRef } from "react"
import { motion, useMotionTemplate, useMotionValue } from "framer-motion"
import { CheckCircle, Users, Star, Linkedin, ArrowDown } from "lucide-react"
import { InteractiveGame } from "./InteractiveGame"
import type { PlatformStats } from "@/lib/about/stats"

export function HeroSection({ stats }: { stats?: PlatformStats }) {
  const containerRef = useRef<HTMLElement>(null)
  
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)

  function handleMouseMove({ currentTarget, clientX, clientY }: React.MouseEvent) {
    const { left, top } = currentTarget.getBoundingClientRect()
    mouseX.set(clientX - left)
    mouseY.set(clientY - top)
  }

  const data = stats || {
    questionsSolved: "850+",
    githubStars: "120+",
    activeUsers: "200+",
    linkedinFollowers: "1.3k+"
  }

  return (
    <section
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className="relative flex min-h-[calc(100svh)] items-center justify-center overflow-hidden bg-gray-50 transition-colors duration-300 dark:bg-transparent pt-20 pb-10 group"
    >
      
      <div className="pointer-events-none absolute inset-0">
         <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_70%,transparent_100%)]" />
      </div>

      <motion.div
        className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{
          maskImage: useMotionTemplate`radial-gradient(300px circle at ${mouseX}px ${mouseY}px, black, transparent)`,
          WebkitMaskImage: useMotionTemplate`radial-gradient(300px circle at ${mouseX}px ${mouseY}px, black, transparent)`,
        }}
      >
         <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e5eff_1px,transparent_1px),linear-gradient(to_bottom,#1e5eff_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#ff2d55_1px,transparent_1px),linear-gradient(to_bottom,#ff2d55_1px,transparent_1px)] bg-[size:40px_40px] opacity-20 dark:opacity-30" />
      </motion.div>

      <div className="pointer-events-none absolute inset-0">
         <div className="absolute left-1/2 top-1/2 h-[70svh] w-[70svw] min-h-[500px] min-w-[500px] md:h-[900px] md:w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full 
            bg-[#1e5eff]/10 blur-[120px] mix-blend-multiply 
            dark:bg-[#ff2d55]/10 dark:mix-blend-screen transition-all duration-500" 
         />
      </div>

      <div className="relative z-10 grid w-full max-w-[1600px] grid-cols-1 items-center px-4 sm:px-6 lg:px-8 xl:grid-cols-12 xl:gap-8 h-full">
        
        <div className="hidden h-full flex-col justify-center gap-24 xl:col-span-3 xl:flex">
             <motion.div initial={{ x: -50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.2 }} className="self-end">
                <GlassWidget icon={CheckCircle} color="text-green-500" bg="bg-green-500/10" label="Quizzes Passed" value={data.questionsSolved} />
             </motion.div>
             <motion.div initial={{ x: -50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.4 }} className="self-start">
                <GlassWidget icon={Star} color="text-yellow-500" bg="bg-yellow-500/10" label="GitHub Stars" value={data.githubStars} />
             </motion.div>
        </div>

        <div className="flex flex-col items-center text-center xl:col-span-6">
            
            <div className="scale-90 md:scale-100 mb-6">
                <InteractiveGame />
            </div>

            <motion.h1 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.6 }}
              className="mt-4 mb-8 text-4xl font-black tracking-tight text-gray-900 dark:text-white md:text-6xl lg:text-7xl max-w-5xl text-balance leading-[1.1]"
            >
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#1e5eff] to-[#174ad6] dark:from-[#ff2d55] dark:to-[#e0264b]">
                Debug your skills
              </span> before the recruiter does.
            </motion.h1>
            
            <motion.p 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="max-w-3xl text-base font-light leading-relaxed text-gray-600 text-balance dark:text-gray-400 md:text-xl mb-10"
            >
              Stop guessing. We decoded the chaotic interview process into a structured roadmap. <strong className="font-medium text-gray-900 dark:text-gray-200">Compile your scattered knowledge</strong> into a production-ready skillset and land that offer.
            </motion.p>

            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="grid w-full max-w-lg grid-cols-2 gap-4 xl:hidden"
            >
                <MobileStatItem icon={CheckCircle} color="text-green-500" bg="bg-green-500/10" label="Quizzes" value={data.questionsSolved} />
                <MobileStatItem icon={Star} color="text-yellow-500" bg="bg-yellow-500/10" label="Stars" value={data.githubStars} />
                <MobileStatItem icon={Users} color="text-[#ff2d55]" bg="bg-[#ff2d55]/10" label="Users" value={data.activeUsers} />
                <MobileStatItem icon={Linkedin} color="text-blue-600" bg="bg-blue-600/10" label="Followers" value={data.linkedinFollowers} />
            </motion.div>

            <motion.div 
                animate={{ y: [0, 10, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="mt-16 text-gray-400 dark:text-gray-600 hidden xl:block"
            >
                <ArrowDown className="h-6 w-6" />
            </motion.div>
        </div>

        <div className="hidden h-full flex-col justify-center gap-24 xl:col-span-3 xl:flex">
             <motion.div initial={{ x: 50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.3 }} className="self-start">
                <GlassWidget icon={Users} color="text-[#ff2d55]" bg="bg-[#ff2d55]/10" label="Active Users" value={data.activeUsers} />
             </motion.div>
             <motion.div initial={{ x: 50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.5 }} className="self-end">
                <GlassWidget icon={Linkedin} color="text-blue-600" bg="bg-blue-600/10" label="LinkedIn Followers" value={data.linkedinFollowers} />
             </motion.div>
        </div>

      </div>
    </section>
  )
}

function GlassWidget({ icon: Icon, color, bg, label, value }: any) {
    return (
        <motion.div 
            whileHover={{ y: -5 }}
            className="flex min-w-[220px] items-center gap-4 rounded-2xl border border-gray-100 bg-white/60 p-5 shadow-xl backdrop-blur-xl transition-all hover:border-[#1e5eff]/30 dark:border-white/5 dark:bg-[#111]/60 dark:hover:border-[#ff2d55]/30 dark:shadow-black/50"
        >
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${bg} ${color}`}>
                <Icon size={24} />
            </div>
            <div className="flex flex-col items-start">
                <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
            </div>
        </motion.div>
    )
}

function MobileStatItem({ icon: Icon, color, bg, label, value }: any) {
    return (
        <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white/60 p-3 shadow-sm backdrop-blur-xl dark:border-white/5 dark:bg-[#111]/60">
            <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${bg} ${color}`}>
                <Icon size={20} />
            </div>
            <div className="flex flex-col items-start overflow-hidden">
                <div className="text-lg font-bold text-gray-900 dark:text-white leading-tight truncate">{value}</div>
                <div className="text-[10px] uppercase font-medium text-gray-500 dark:text-gray-400 tracking-wider truncate">{label}</div>
            </div>
        </div>
    )
}