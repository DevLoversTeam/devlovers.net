"use client"

import type React from "react"
import { Link } from '@/i18n/routing';
import { MessageCircle, Brain, Trophy, User, ShoppingBag, Star, Flame, Target } from "lucide-react"
import { useTranslations } from "next-intl"

interface FeatureCardProps {
  icon: React.ReactNode
  title: string
  description: string
  href: string
  className?: string
  children?: React.ReactNode
}

function FeatureCard({ icon, title, description, href, className = "", children }: FeatureCardProps) {
  const t = useTranslations("about.features")

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border p-6 transition-all duration-300 hover:scale-[1.02]
      bg-white border-gray-200 shadow-sm hover:border-blue-500/50 hover:shadow-blue-500/10
      dark:bg-white/5 dark:border-white/10 dark:backdrop-blur-md dark:hover:bg-white/10 dark:hover:border-blue-500/50
      ${className}`}
    >
      <div className="absolute -inset-px rounded-2xl bg-gradient-to-r from-blue-500/0 via-blue-500/0 to-blue-500/0 opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-30" />
      <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full bg-blue-500/10 blur-3xl transition-all duration-500 group-hover:bg-blue-500/20 dark:bg-blue-500/20 dark:group-hover:bg-blue-500/30" />

      <div className="relative z-10 flex h-full flex-col">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-blue-50 ring-1 ring-blue-500/20 transition-all duration-300 group-hover:ring-blue-500/50 group-hover:shadow-lg group-hover:shadow-blue-500/20 dark:bg-gradient-to-br dark:from-blue-500/20 dark:to-blue-600/20 dark:ring-blue-500/30">
          <div className="text-blue-600 dark:text-blue-400">
            {icon}
          </div>
        </div>

        <div className="flex-1">
          <h3 className="mb-2 text-xl font-bold text-gray-900 dark:text-white">{title}</h3>
          <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-400">{description}</p>
          {children}
        </div>

        <Link
          href={href}
          className="mt-4 inline-block w-fit rounded-lg border px-4 py-2 text-sm font-medium transition-all duration-300
          border-gray-200 text-gray-700 hover:border-blue-500 hover:bg-blue-50 hover:text-blue-700
          dark:border-white/20 dark:text-white/80 dark:hover:border-blue-500/50 dark:hover:bg-blue-500/10 dark:hover:text-white"
        >
          {t("learnMore")}
        </Link>
      </div>
    </div>
  )
}

function ProgressBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-600 dark:text-gray-400">{label}</span>
        <span className="text-gray-900 dark:text-gray-300 font-medium">{value}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

function AchievementBadge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-amber-500/10 to-orange-500/10 text-amber-600 ring-1 ring-amber-500/30 dark:from-amber-500/20 dark:to-orange-500/20 dark:text-amber-400">
        {icon}
      </div>
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
    </div>
  )
}

export function FeaturesSection() {
  const t = useTranslations("about.features")
  const tProfile = useTranslations("about.features.profile")

  return (
    <section className="relative px-4 py-20 sm:px-6 lg:px-8 transition-colors duration-300 bg-white dark:bg-transparent">

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute left-1/4 top-1/4 h-96 w-96 rounded-full bg-blue-400/10 blur-3xl dark:bg-blue-500/10" />
        <div className="absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-blue-400/10 blur-3xl dark:bg-blue-600/10" />
      </div>

      <div className="relative mx-auto max-w-6xl">
        <div className="mb-12 text-center">
          <h2 className="mb-4 text-4xl font-bold text-gray-900 dark:text-white md:text-5xl">
            {t("title")} <span className="text-blue-600 dark:text-blue-400">{t("titleHighlight")}</span>
          </h2>
          <p className="mx-auto max-w-2xl text-gray-600 dark:text-gray-400">
            {t("subtitle")}
          </p>
        </div>

        <div className="grid auto-rows-[minmax(200px,auto)] grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">

          <FeatureCard
            icon={<MessageCircle className="h-7 w-7" />}
            title={t("qa.title")}
            description={t("qa.description")}
            href="/q&a"
            className="lg:row-span-1"
          />

          <FeatureCard
            icon={<Brain className="h-7 w-7" />}
            title={t("quiz.title")}
            description={t("quiz.description")}
            href="/quiz"
            className="lg:row-span-1"
          />

          <FeatureCard
            icon={<User className="h-7 w-7" />}
            title={t("profile.title")}
            description={t("profile.description")}
            href="/profile"
            className="md:col-span-2 lg:col-span-1 lg:row-span-2"
          >
            <div className="mt-4 space-y-4 rounded-xl border p-4 bg-gray-50 border-gray-100 dark:bg-white/5 dark:border-white/10">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-lg font-bold text-white shadow-lg shadow-blue-500/20">
                  JD
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">John Doe</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{tProfile("level")}</p>
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-500">{tProfile("achievements")}</p>
                <div className="flex justify-around">
                  <AchievementBadge icon={<Star className="h-5 w-5" />} label={tProfile("badges.star")} />
                  <AchievementBadge icon={<Flame className="h-5 w-5" />} label={tProfile("badges.streak")} />
                  <AchievementBadge icon={<Target className="h-5 w-5" />} label={tProfile("badges.focus")} />
                  <AchievementBadge icon={<Trophy className="h-5 w-5" />} label={tProfile("badges.champ")} />
                </div>
              </div>
              <div className="space-y-3">
                <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-500">{tProfile("progress")}</p>
                <ProgressBar label={tProfile("courseCompletion")} value={78} color="bg-gradient-to-r from-blue-500 to-blue-400" />
                <ProgressBar label={tProfile("quizAccuracy")} value={92} color="bg-gradient-to-r from-emerald-500 to-emerald-400" />
                <ProgressBar label={tProfile("weeklyGoal")} value={65} color="bg-gradient-to-r from-amber-500 to-amber-400" />
              </div>
            </div>
          </FeatureCard>

          <FeatureCard
            icon={<Trophy className="h-7 w-7" />}
            title={t("leaderboard.title")}
            description={t("leaderboard.description")}
            href="/leaderboard"
            className="lg:row-span-1"
          />

          <FeatureCard
            icon={<ShoppingBag className="h-7 w-7" />}
            title={t("shop.title")}
            description={t("shop.description")}
            href="/shop"
            className="lg:row-span-1"
          />
        </div>
      </div>
    </section>
  )
}
