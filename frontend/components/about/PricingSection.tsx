"use client"

import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence, useInView } from "framer-motion"
import { Heart, Sparkles, Coffee } from "lucide-react"
import { useTranslations } from "next-intl"

function PriceEvolution() {
    const containerRef = useRef(null)
    const isInView = useInView(containerRef, { once: true, amount: 0.5 })

    const [displayValue, setDisplayValue] = useState("$14.99")
    const [isFinal, setIsFinal] = useState(false)
    const [colorState, setColorState] = useState<"normal" | "rising" | "chaos">("normal")

    useEffect(() => {
        if (!isInView) return

        let interval: NodeJS.Timeout
        let step = 0

        const sequence = async () => {
            await new Promise(r => setTimeout(r, 1500))

            setColorState("rising")
            let currentValue = 14.99

            await new Promise<void>(resolve => {
                interval = setInterval(() => {
                    currentValue += Math.random() * 10
                    setDisplayValue(`$${Math.floor(currentValue)}`)

                    step++
                    if (step > 15) {
                        clearInterval(interval)
                        resolve()
                    }
                }, 50)
            })

            setColorState("chaos")
            const chars = "!@#$%^&*?<>~"

            await new Promise<void>(resolve => {
                let chaosStep = 0
                interval = setInterval(() => {
                    const randomStr = Array(3).fill(0).map(() => chars[Math.floor(Math.random() * chars.length)]).join("")
                    setDisplayValue(`$${randomStr}`)

                    chaosStep++
                    if (chaosStep > 10) {
                        clearInterval(interval)
                        resolve()
                    }
                }, 50)
            })

            setIsFinal(true)
        }

        sequence()

        return () => clearInterval(interval)
    }, [isInView])

    return (
        <div ref={containerRef} className="h-24 flex items-center justify-center relative overflow-hidden">
            <AnimatePresence mode="wait">
                {!isFinal ? (
                    <motion.div
                        key="changing-text"
                        exit={{ opacity: 0, scale: 0.5, filter: "blur(10px)" }}
                        transition={{ duration: 0.4 }}
                        className="flex items-center justify-center"
                    >
                        <motion.span
                            className={`text-6xl font-bold tracking-tighter font-mono transition-colors duration-200
                                ${colorState === "normal" ? "text-muted-foreground/50" : ""}
                                ${colorState === "rising" ? "text-red-400" : ""}
                                ${colorState === "chaos" ? "text-foreground" : ""}
                            `}
                        >
                            {displayValue}
                        </motion.span>
                    </motion.div>
                ) : (
                    <motion.div
                        key="final-zero"
                        initial={{ opacity: 0, scale: 2, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{
                                type: "spring",
                                stiffness: 200,
                                damping: 15
                        }}
                        className="flex items-center gap-4"
                    >
                        <span className="text-8xl font-black text-foreground tracking-tighter drop-shadow-2xl">
                            $0
                        </span>
                        <motion.div
                                initial={{ scale: 0, rotate: -45 }}
                                animate={{ scale: 1, rotate: 0 }}
                                transition={{ delay: 0.2, type: "spring" }}
                        >
                             <Heart className="h-12 w-12 text-[#2C7FFF] fill-[#2C7FFF]" />
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

export function PricingSection() {
    const t = useTranslations("about.pricing")
    const tFeatures = useTranslations("about.pricing.features")

    const features = [
        tFeatures("unlimitedQuestions"),
        tFeatures("fullQuizAccess"),
        tFeatures("globalLeaderboard"),
        tFeatures("progressTracking"),
        tFeatures("communityChallenges"),
        tFeatures("mobileFriendly")
    ]

    return (
        <section className="relative px-6 py-24 bg-background transition-colors duration-300 overflow-hidden">
            <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-96 w-96 rounded-full bg-[#2C7FFF]/10 blur-[100px]" />

            <div className="mx-auto max-w-5xl relative z-10">

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6 }}
                    className="mb-16 text-center"
                >
                    <h2 className="text-3xl font-bold text-foreground md:text-5xl tracking-tight mb-4">
                        {t("title")} <br className="hidden md:block" />
                        <span className="text-[#2C7FFF]">{t("titleHighlight")}</span>
                    </h2>
                    <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                        {t("subtitle")}
                    </p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                    className="relative mx-auto max-w-3xl"
                >
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-20">
                        <span className="flex items-center gap-1 rounded-full bg-gradient-to-r from-[#2C7FFF] to-blue-600 px-4 py-1 text-xs font-bold text-white shadow-lg shadow-blue-500/20 uppercase tracking-wider">
                            <Sparkles className="h-6 w-3" /> {t("badge")}
                        </span>
                    </div>

                    <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-2xl transition-all duration-300 hover:shadow-[#2C7FFF]/10 hover:border-[#2C7FFF]/30">
                        <div className="px-8 py-12 md:px-16 text-center">

                            <div className="mb-10 min-h-[160px] flex flex-col justify-center">
                                 <p className="text-sm font-medium text-muted-foreground mb-4 uppercase tracking-widest">{t("monthlyPrice")}</p>

                                 <PriceEvolution />

                                 <div className="mt-6">
                                        <p className="text-[#2C7FFF] font-medium bg-[#2C7FFF]/10 inline-block px-4 py-1 rounded-full text-sm">
                                                {t("free")}
                                        </p>
                                 </div>
                            </div>

                            <div className="h-px w-full bg-gradient-to-r from-transparent via-border to-transparent mb-10" />

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-12 text-left max-w-lg mx-auto mb-12">
                                {features.map((feature) => (
                                    <div key={feature} className="flex items-center gap-3">
                                        <div className="flex-shrink-0 h-5 w-5 rounded-full bg-[#2C7FFF]/10 flex items-center justify-center">
                                             <Heart className="h-3 w-3 text-[#2C7FFF] fill-[#2C7FFF]" />
                                        </div>
                                        <span className="text-muted-foreground text-sm font-medium">{feature}</span>
                                    </div>
                                ))}
                            </div>

                            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                                <button className="w-full sm:w-auto px-8 py-3 rounded-full bg-[#2C7FFF] hover:bg-blue-600 text-white font-bold transition-all shadow-lg shadow-[#2C7FFF]/25">
                                    {t("cta")}
                                </button>

                                <a
                                    href="https://buymeacoffee.com/viktor.svertoka"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="w-full sm:w-auto px-8 py-3 rounded-full border border-border hover:bg-muted text-foreground font-medium transition-all flex items-center justify-center gap-2 group"
                                >
                                    <Coffee className="h-4 w-4 text-muted-foreground group-hover:text-[#2C7FFF] transition-colors" />
                                    <span>{t("coffee")}</span>
                                </a>
                            </div>

                            <p className="mt-6 text-xs text-muted-foreground/60">
                                {t("noCard")}
                            </p>
                        </div>
                    </div>
                </motion.div>
            </div>
        </section>
    )
}
