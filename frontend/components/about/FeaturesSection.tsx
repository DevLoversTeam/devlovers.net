"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Link } from "@/i18n/routing"
import { MessageCircle, Brain, Trophy, User, ShoppingBag } from "lucide-react"

const tMock = (key: string) => {
    const map: any = {
        "title": "Everything you need to",
        "titleHighlight": "get hired",
        "subtitle": "Stop searching for scattered info. We curated the ultimate toolkit to crack technical interviews.",
        
        "qa.title": "Q&A",
        "qa.description": "No fluff. Just a massive library of real interview questions with precise, recruiter-approved answers.",
        
        "quiz.title": "Quizzes",
        "quiz.description": "Validate your confidence. Fast-paced interactive quizzes to spot your weak points before the interviewer does.",
        
        "leaderboard.title": "Leaderboard",
        "leaderboard.description": "Gamify your prep. Earn points for every correct answer, keep your streak alive, and rank up against others.",
        
        "profile.title": "Analytics",
        "profile.description": "Don't fly blind. Visualize your progress with detailed charts to see exactly which topics you've mastered.",
        
        "shop.title": "Shop",
        "shop.description": "Upgrade your setup. High-quality developer apparel, desk accessories, and digital assets available for purchase.",
    }
    return map[key] || key
}

export function FeaturesSection() {
  const t = tMock 
  const [activeTab, setActiveTab] = useState("qa")

  const features = [
    { id: "qa", icon: MessageCircle, href: "/q&a" },
    { id: "quiz", icon: Brain, href: "/quizzes" },
    { id: "leaderboard", icon: Trophy, href: "/leaderboard" },
    { id: "profile", icon: User, href: "/profile" },
    { id: "shop", icon: ShoppingBag, href: "/shop" },
  ]

  const activeFeature = features.find((f) => f.id === activeTab)
  const activeHref = activeFeature ? activeFeature.href : "/"

  return (
    <section className="relative w-full py-24 overflow-hidden bg-gray-50 dark:bg-transparent">
      
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-full max-w-4xl h-[500px] rounded-full blur-[120px] opacity-30 
          bg-[#1e5eff]/15 dark:bg-[#ff2d55]/15 mix-blend-multiply dark:mix-blend-screen" 
        />
      </div>

      <div className="relative container mx-auto px-4 max-w-5xl z-10 flex flex-col items-center">
        
        <div className="mb-12 text-center max-w-3xl">
          <h2 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight text-gray-900 dark:text-white">
            {t("title")} <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#1e5eff] to-[#174ad6] dark:from-[#ff2d55] dark:to-[#e0264b]">{t("titleHighlight")}</span>
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            {t("subtitle")}
          </p>
        </div>

        <div className="w-full relative mb-10 group perspective-1000">
          
          <div className="absolute -inset-1 rounded-xl blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-700
             bg-gradient-to-t from-[#1e5eff]/20 to-transparent dark:from-[#ff2d55]/20" 
          />

          <Link href={activeHref} className="block relative w-full focus:outline-none cursor-pointer">
            <div className="relative w-full aspect-video rounded-xl overflow-hidden shadow-2xl transition-all duration-500 group-hover:scale-[1.01] 
              border border-gray-200 dark:border-white/10
              bg-white dark:bg-[#0f0f0f]
              group-hover:shadow-[0_0_40px_-10px_rgba(30,94,255,0.3)] dark:group-hover:shadow-[0_0_40px_-10px_rgba(255,45,85,0.3)]"
            >
              
              <div className="absolute top-0 left-0 w-full h-10 flex items-center px-4 z-20 backdrop-blur-md
                border-b border-gray-200 dark:border-white/5
                bg-white/90 dark:bg-[#1a1a1a]/95"
              >
                <div className="flex gap-2 opacity-100 dark:opacity-70 group-hover:opacity-100 transition-opacity">
                  <div className="w-3 h-3 rounded-full bg-[#ff5f56] border border-black/5" />
                  <div className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-black/5" />
                  <div className="w-3 h-3 rounded-full bg-[#27c93f] border border-black/5" />
                </div>
                
                <div className="ml-4 px-3 py-1 rounded-md text-[10px] font-mono flex items-center select-none transition-colors
                  border border-gray-200 dark:border-white/5
                  bg-gray-50 dark:bg-black/40 
                  text-gray-500 group-hover:text-gray-900 dark:group-hover:text-gray-300"
                >
                  <span className="text-gray-400 dark:text-gray-600 mr-1">https://</span>
                  devlovers.net/{activeTab}
                </div>
              </div>

              <div className="absolute inset-0 pt-10 w-full h-full bg-white dark:bg-[#0f0f0f]">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, scale: 1.02, filter: "blur(4px)" }}
                    animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                    exit={{ opacity: 0, scale: 0.98, filter: "blur(4px)" }}
                    transition={{ duration: 0.35, ease: "easeInOut" }}
                    className="w-full h-full flex flex-col items-center justify-center relative overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-[size:24px_24px]
                      bg-[linear-gradient(to_right,#00000008_1px,transparent_1px),linear-gradient(to_bottom,#00000008_1px,transparent_1px)]
                      dark:bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)]" 
                    />
                    
                    <div className="z-10 w-full h-full flex items-center justify-center p-8">
                        {activeTab === 'qa' && <QAVisual />}
                        {activeTab === 'quiz' && <QuizVisual />}
                        {activeTab === 'leaderboard' && <LeaderboardVisual />}
                        {activeTab === 'profile' && <ProfileVisual />}
                        {activeTab === 'shop' && <ShopVisual />}
                    </div>

                    <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </Link>
        </div>

        <div className="flex flex-wrap justify-center gap-2 mb-8 p-1.5 transition-all
          rounded-2xl md:rounded-full
          border border-gray-200 dark:border-white/10
          bg-white dark:bg-white/5 backdrop-blur-md shadow-sm dark:shadow-none"
        >
          {features.map((feature) => {
            const isActive = activeTab === feature.id
            return (
              <button
                key={feature.id}
                onClick={() => setActiveTab(feature.id)}
                className={`relative px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-300 ${
                  isActive 
                    ? "text-white" 
                    : "text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10"
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeTabBackground"
                    className="absolute inset-0 bg-[#1e5eff] dark:bg-[#ff2d55] shadow-lg shadow-[#1e5eff]/25 dark:shadow-[#ff2d55]/25"
                    initial={false}
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    style={{ borderRadius: 9999 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-2">
                    <feature.icon size={16} />
                    {t(`${feature.id}.title`)}
                </span>
              </button>
            )
          })}
        </div>

        <div className="max-w-2xl mx-auto text-center relative h-20 w-full overflow-hidden">
           <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="absolute w-full top-0 left-0 flex justify-center"
            >
              <p className="text-lg text-gray-600 dark:text-gray-300 leading-relaxed font-light">
                {t(`${activeTab}.description`)}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  )
}

function QAVisual() {
    return (
        <div className="w-full max-w-sm space-y-3">
            <motion.div 
                initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                className="bg-white dark:bg-neutral-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-white/10 w-full"
            >
                <div className="flex items-center gap-2 mb-2">
                     <div className="w-2 h-2 rounded-full bg-red-500" />
                     <div className="text-[10px] uppercase font-bold text-gray-400">Question</div>
                </div>
                <div className="h-2 w-3/4 bg-gray-200 dark:bg-white/20 rounded mb-2" />
                <div className="h-2 w-1/2 bg-gray-200 dark:bg-white/20 rounded" />
            </motion.div>
            
            <motion.div 
                 initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
                 className="flex justify-center"
            >
                <div className="w-[1px] h-4 bg-gray-300 dark:bg-white/20" />
            </motion.div>

            <motion.div 
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                className="bg-[#1e5eff]/5 dark:bg-[#ff2d55]/5 p-4 rounded-xl shadow-sm border border-[#1e5eff]/20 dark:border-[#ff2d55]/20 w-full"
            >
                <div className="flex items-center gap-2 mb-2">
                     <div className="w-2 h-2 rounded-full bg-green-500" />
                     <div className="text-[10px] uppercase font-bold text-[#1e5eff] dark:text-[#ff2d55]">Correct Answer</div>
                </div>
                <div className="h-2 w-full bg-[#1e5eff]/20 dark:bg-[#ff2d55]/20 rounded mb-2" />
                <div className="h-2 w-5/6 bg-[#1e5eff]/20 dark:bg-[#ff2d55]/20 rounded mb-2" />
                <div className="h-2 w-2/3 bg-[#1e5eff]/20 dark:bg-[#ff2d55]/20 rounded" />
            </motion.div>
        </div>
    )
}

function QuizVisual() {
    return (
        <div className="relative w-full max-w-sm h-48 flex items-center justify-center">
            <motion.div 
                initial={{ rotate: -5, scale: 0.9 }} animate={{ rotate: -5, scale: 0.95 }} 
                className="absolute inset-0 bg-white dark:bg-neutral-800 rounded-xl border border-gray-200 dark:border-white/5 shadow opacity-60"
            />
            <motion.div 
                 initial={{ rotate: 5, scale: 0.95 }} animate={{ rotate: 5, scale: 0.98 }} 
                 className="absolute inset-0 bg-white dark:bg-neutral-800 rounded-xl border border-gray-200 dark:border-white/5 shadow opacity-80"
            />
             <motion.div 
                 initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                 className="absolute inset-0 bg-white dark:bg-neutral-800 rounded-xl border border-gray-200 dark:border-white/10 shadow-xl p-6 flex flex-col items-center justify-center text-center"
            >
                <Brain className="w-12 h-12 text-[#1e5eff] dark:text-[#ff2d55] mb-4 opacity-80" />
                <div className="h-2 w-3/4 bg-gray-100 dark:bg-white/10 rounded mb-2" />
                <div className="h-2 w-1/2 bg-gray-100 dark:bg-white/10 rounded mb-6" />
                <div className="flex gap-2 w-full">
                    <div className="h-8 flex-1 rounded bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/5" />
                    <div className="h-8 flex-1 rounded bg-[#1e5eff]/10 dark:bg-[#ff2d55]/10 border border-[#1e5eff]/30 dark:border-[#ff2d55]/30" />
                </div>
            </motion.div>
        </div>
    )
}

function LeaderboardVisual() {
    return (
        <div className="flex items-end gap-4 h-32">
            <motion.div 
                initial={{ height: 0 }} animate={{ height: "40%" }} transition={{ delay: 0.2 }}
                className="w-16 bg-gray-200 dark:bg-white/10 rounded-t-lg relative group"
            >
                 <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs text-gray-400 font-bold">3</div>
            </motion.div>
            <motion.div 
                initial={{ height: 0 }} animate={{ height: "100%" }} transition={{ delay: 0.4, type: "spring" }}
                className="w-16 bg-gradient-to-t from-[#1e5eff] to-[#60a5fa] dark:from-[#ff2d55] dark:to-[#ff7c9c] rounded-t-lg relative shadow-lg shadow-blue-500/20 dark:shadow-pink-500/20"
            >
                <Trophy className="absolute -top-8 left-1/2 -translate-x-1/2 w-6 h-6 text-[#1e5eff] dark:text-[#ff2d55]" />
                <div className="absolute top-2 left-1/2 -translate-x-1/2 text-white font-bold">1</div>
            </motion.div>
            <motion.div 
                initial={{ height: 0 }} animate={{ height: "70%" }} transition={{ delay: 0.3 }}
                className="w-16 bg-gray-300 dark:bg-white/20 rounded-t-lg relative"
            >
                 <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs text-gray-400 font-bold">2</div>
            </motion.div>
        </div>
    )
}

function ProfileVisual() {
    return (
        <div className="w-full max-w-md bg-white dark:bg-neutral-800 rounded-xl border border-gray-200 dark:border-white/5 p-4 shadow-sm">
            <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-white/10" />
                <div className="space-y-2">
                    <div className="h-3 w-32 bg-gray-200 dark:bg-white/20 rounded" />
                    <div className="h-2 w-20 bg-gray-100 dark:bg-white/10 rounded" />
                </div>
            </div>
            <div className="space-y-3">
                <div className="flex justify-between text-xs text-gray-400">
                    <span>JS</span>
                    <span>85%</span>
                </div>
                <div className="w-full h-2 bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
                    <motion.div 
                        initial={{ width: 0 }} animate={{ width: "85%" }} transition={{ duration: 1, delay: 0.2 }}
                        className="h-full bg-yellow-400 rounded-full" 
                    />
                </div>
                 <div className="flex justify-between text-xs text-gray-400">
                    <span>React</span>
                    <span>60%</span>
                </div>
                <div className="w-full h-2 bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
                    <motion.div 
                        initial={{ width: 0 }} animate={{ width: "60%" }} transition={{ duration: 1, delay: 0.4 }}
                        className="h-full bg-blue-400 rounded-full" 
                    />
                </div>
            </div>
        </div>
    )
}

function ShopVisual() {
    return (
        <div className="flex gap-4">
            {[1, 2].map((i) => (
                <motion.div 
                    key={i}
                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                    className="w-36 bg-white dark:bg-neutral-800 rounded-xl border border-gray-200 dark:border-white/5 p-3 shadow-sm hover:-translate-y-1 transition-transform relative"
                >
                    <div className="w-full aspect-square bg-gray-100 dark:bg-white/5 rounded-lg mb-3 flex items-center justify-center">
                        <ShoppingBag className="w-6 h-6 text-gray-300" />
                    </div>
                    <div className="h-2 w-3/4 bg-gray-200 dark:bg-white/20 rounded mb-2" />
                    <div className="flex justify-between items-center mt-2">
                         <div className="h-3 w-10 bg-[#1e5eff]/20 dark:bg-[#ff2d55]/20 rounded" />
                         <div className="text-[10px] font-bold text-gray-400">$25</div>
                    </div>
                </motion.div>
            ))}
        </div>
    )
}