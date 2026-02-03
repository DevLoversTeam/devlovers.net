'use client';

import { motion } from 'framer-motion';
import { ArrowDown, CheckCircle, Linkedin, Star, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { DynamicGridBackground } from '@/components/shared/DynamicGridBackground';
import type { PlatformStats } from '@/lib/about/stats';

import { InteractiveGame } from './InteractiveGame';

export function HeroSection({ stats }: { stats?: PlatformStats }) {
  const t = useTranslations('about.hero');

  const data = stats || {
    questionsSolved: '850+',
    githubStars: '120+',
    activeUsers: '200+',
    linkedinFollowers: '1.3k+',
  };

  return (
    <DynamicGridBackground
      showStaticGrid
      className="flex min-h-[calc(100svh)] items-center justify-center bg-gray-50 pt-20 pb-10 transition-colors duration-300 dark:bg-transparent"
    >
      <div className="relative z-10 grid h-full w-full max-w-[1600px] grid-cols-1 items-center px-4 sm:px-6 lg:px-8 xl:grid-cols-12 xl:gap-8">
        <div className="hidden h-full flex-col justify-center gap-24 xl:col-span-3 xl:flex">
          <motion.div
            initial={{ x: -50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="self-end"
          >
            <GlassWidget
              icon={CheckCircle}
              color="text-green-500"
              bg="bg-green-500/10"
              label={t('stats.quizzesPassed')}
              value={data.questionsSolved}
            />
          </motion.div>
          <motion.div
            initial={{ x: -50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="self-start"
          >
            <GlassWidget
              icon={Star}
              color="text-yellow-500"
              bg="bg-yellow-500/10"
              label={t('stats.githubStars')}
              value={data.githubStars}
            />
          </motion.div>
        </div>

        <div className="flex flex-col items-center text-center xl:col-span-6">
          <div className="mb-6 scale-90 md:scale-100">
            <InteractiveGame />
          </div>

          <motion.h1
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6 }}
            className="mt-4 mb-8 max-w-5xl text-4xl leading-[1.1] font-black tracking-tight text-balance text-gray-900 md:text-5xl lg:text-6xl xl:text-7xl dark:text-white"
          >
            <span className="bg-gradient-to-r from-[#1e5eff] to-[#1e5eff]/70 bg-clip-text text-transparent dark:from-[#ff2d55] dark:to-[#ff2d55]/70">
              {t('titleHighlight')} <br />
            </span>{' '}
            {t('titleRest')}
          </motion.h1>

          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mb-10 max-w-3xl text-sm leading-relaxed font-light text-balance text-gray-700 md:text-lg lg:text-xl dark:text-gray-300"
          >
            {t('description')}{' '}
            <strong className="font-medium text-gray-900 dark:text-gray-200">
              {t('descriptionHighlight')}
            </strong>{' '}
            {t('descriptionRest')}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="grid w-full max-w-lg grid-cols-2 gap-4 xl:hidden"
          >
            <MobileStatItem
              icon={CheckCircle}
              color="text-green-500"
              bg="bg-green-500/10"
              label={t('stats.quizzes')}
              value={data.questionsSolved}
            />
            <MobileStatItem
              icon={Star}
              color="text-yellow-500"
              bg="bg-yellow-500/10"
              label={t('stats.stars')}
              value={data.githubStars}
            />
            <MobileStatItem
              icon={Users}
              color="text-[#ff2d55]"
              bg="bg-[#ff2d55]/10"
              label={t('stats.users')}
              value={data.activeUsers}
            />
            <MobileStatItem
              icon={Linkedin}
              color="text-blue-600"
              bg="bg-blue-600/10"
              label={t('stats.followers')}
              value={data.linkedinFollowers}
            />
          </motion.div>

          <motion.div
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="mt-16 hidden text-gray-400 xl:block dark:text-gray-600"
          >
            <ArrowDown className="h-6 w-6" aria-hidden="true" />
          </motion.div>
        </div>

        <div className="hidden h-full flex-col justify-center gap-24 xl:col-span-3 xl:flex">
          <motion.div
            initial={{ x: 50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="self-start"
          >
            <GlassWidget
              icon={Users}
              color="text-[#ff2d55]"
              bg="bg-[#ff2d55]/10"
              label={t('stats.activeUsers')}
              value={data.activeUsers}
            />
          </motion.div>
          <motion.div
            initial={{ x: 50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="self-end"
          >
            <GlassWidget
              icon={Linkedin}
              color="text-blue-600"
              bg="bg-blue-600/10"
              label={t('stats.linkedinFollowers')}
              value={data.linkedinFollowers}
            />
          </motion.div>
        </div>
      </div>
    </DynamicGridBackground>
  );
}

function GlassWidget({ icon: Icon, color, bg, label, value }: any) {
  return (
    <motion.div
      whileHover={{ y: -5 }}
      className="flex min-w-[220px] items-center gap-4 rounded-2xl border border-gray-100 bg-white/10 p-5 shadow-xl backdrop-blur-xl transition-all hover:border-[#1e5eff]/30 dark:border-white/5 dark:bg-neutral-900/10 dark:shadow-black/50 dark:hover:border-[#ff2d55]/30"
    >
      <div
        className={`flex h-12 w-12 items-center justify-center rounded-xl ${bg} ${color}`}
        aria-hidden="true"
      >
        <Icon size={24} />
      </div>
      <div className="flex flex-col items-start">
        <div className="text-[10px] font-bold tracking-widest text-gray-400 uppercase">
          {label}
        </div>
        <div className="text-2xl font-bold text-gray-900 dark:text-white">
          {value}
        </div>
      </div>
    </motion.div>
  );
}

function MobileStatItem({ icon: Icon, color, bg, label, value }: any) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white/10 p-3 shadow-sm backdrop-blur-xl dark:border-white/5 dark:bg-neutral-900/10">
      <div
        className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${bg} ${color}`}
        aria-hidden="true"
      >
        <Icon size={20} />
      </div>
      <div className="flex flex-col items-start overflow-hidden">
        <div className="truncate text-lg leading-tight font-bold text-gray-900 dark:text-white">
          {value}
        </div>
        <div className="truncate text-[10px] font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
          {label}
        </div>
      </div>
    </div>
  );
}
