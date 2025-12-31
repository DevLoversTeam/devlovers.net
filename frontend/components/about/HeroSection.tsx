"use client"

import { motion } from "framer-motion"
import { Heart, Sparkles } from "lucide-react"
import { StatsSection } from "@/components/about/StatsSection"
import { useTranslations } from "next-intl"

export function HeroSection() {
    const t = useTranslations("about.hero")

    return (
        <section className="relative flex flex-col items-center justify-center px-6 py-24 bg-background transition-colors duration-300 overflow-hidden">
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute left-1/2 top-1/4 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#2C7FFF]/10 blur-3xl" />
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8 }}
                className="relative z-10 flex flex-col items-center text-center max-w-4xl mx-auto"
            >
                <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    whileInView={{ scale: 1, opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, delay: 0.2 }}
                    className="mb-10 flex items-center gap-4 select-none"
                >
                    <span className="font-mono text-6xl font-bold text-[#2C7FFF] md:text-8xl">{"{"}</span>
                    <motion.div
                        animate={{ scale: [1, 1.15, 1] }}
                        transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                    >
                        <Heart className="h-16 w-16 fill-[#2C7FFF] text-[#2C7FFF] md:h-24 md:w-24" strokeWidth={0} />
                    </motion.div>
                    <span className="font-mono text-6xl font-bold text-[#2C7FFF] md:text-8xl">{"}"}</span>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#2C7FFF]/20 bg-[#2C7FFF]/5 px-4 py-1.5 text-sm font-medium text-[#2C7FFF]"
                >
                    <Sparkles className="h-4 w-4" />
                    <span>{t("badge")}</span>
                </motion.div>

                <h2 className="mb-6 text-balance text-3xl font-bold tracking-tight text-foreground md:text-5xl transition-colors duration-300">
                    {t("title")} <br />
                    <span className="text-[#2C7FFF]">{t("titleHighlight")}</span>
                </h2>

                <p className="max-w-2xl text-pretty text-lg text-muted-foreground md:text-xl transition-colors duration-300 mb-12">
                    {t("description")}
                </p>

                <div className="w-full h-px bg-gradient-to-r from-transparent via-border to-transparent mb-12 opacity-50" />

                <StatsSection />
            </motion.div>
        </section>
    )
}
