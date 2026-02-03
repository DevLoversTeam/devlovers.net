'use client';

import { ArrowRight, ExternalLink, Github, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { GradientBadge } from '@/components/ui/gradient-badge';
import { SectionHeading } from '@/components/ui/section-heading';
import { type Testimonial, TESTIMONIALS } from '@/data/about';

export function CommunitySection() {
  const t = useTranslations('about.community');

  return (
    <section className="relative w-full overflow-hidden bg-gray-50 py-20 lg:py-28 dark:bg-transparent">
      <div className="pointer-events-none absolute top-1/2 left-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#1e5eff]/5 blur-[80px] dark:bg-[#ff2d55]/5" />

      <div className="relative z-10 w-full">
        <div className="container-main mb-12 text-center">
          <GradientBadge
            icon={MessageCircle}
            text={t('badge')}
            className="mb-4"
          />

          <SectionHeading
            title={t('title')}
            highlight={t('titleHighlight')}
            subtitle={t('subtitle')}
            className="mb-0"
          />
        </div>

        <div className="pause-on-hover relative mb-8 w-full md:mb-16">
          <div className="dark:from-background pointer-events-none absolute top-0 left-0 z-10 h-full w-12 bg-gradient-to-r from-gray-50 to-transparent md:w-32" />
          <div className="dark:from-background pointer-events-none absolute top-0 right-0 z-10 h-full w-12 bg-gradient-to-l from-gray-50 to-transparent md:w-32" />

          <div className="flex w-max min-w-full">
            <div className="animate-scroll flex shrink-0 gap-4 px-2">
              {TESTIMONIALS.map((testimonial, index) => (
                <TestimonialCard key={`loop1-${index}`} {...testimonial} />
              ))}
            </div>
            <div
              className="animate-scroll flex shrink-0 gap-4 px-2"
              aria-hidden="true"
            >
              {TESTIMONIALS.map((testimonial, index) => (
                <TestimonialCard key={`loop2-${index}`} {...testimonial} />
              ))}
            </div>
          </div>
        </div>

        <div className="container-main text-center">
          <div className="flex flex-col items-center gap-2 md:hidden">
            <Link
              href="https://github.com/DevLoversTeam/devlovers.net/discussions"
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white/50 px-4 py-2 text-[10px] font-bold tracking-wider text-gray-700 uppercase transition-all duration-300 hover:border-[#1e5eff]/40 hover:text-[#1e5eff] dark:border-white/10 dark:bg-white/5 dark:text-gray-300 dark:hover:border-[#ff2d55]/40 dark:hover:text-[#ff2d55]"
            >
              <Github size={12} />
              {t('joinDiscussion')}
              <ArrowRight
                size={10}
                className="transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          </div>

          <Link
            href="https://github.com/DevLoversTeam/devlovers.net/discussions"
            target="_blank"
            rel="noopener noreferrer"
            className="group relative hidden items-center justify-center gap-4 rounded-full border border-gray-200 bg-white p-1.5 pr-1.5 pl-6 transition-all duration-300 ease-out hover:scale-[1.02] hover:border-[#1e5eff]/50 hover:shadow-[0_0_30px_-5px_rgba(30,94,255,0.15)] md:inline-flex dark:border-white/10 dark:bg-white/5 dark:hover:border-[#ff2d55]/50 dark:hover:shadow-[0_0_30px_-5px_rgba(255,45,85,0.15)]"
          >
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
              {t('successStory')}
            </span>

            <span className="flex items-center gap-2 rounded-full bg-gray-900 px-5 py-2.5 text-xs font-bold tracking-wider text-white uppercase transition-all duration-300 group-hover:bg-[#1e5eff] group-hover:text-white dark:bg-white dark:text-black dark:group-hover:bg-[#ff2d55] dark:group-hover:text-white">
              <Github size={14} />
              {t('joinDiscussion')}
              <ArrowRight
                size={12}
                className="transition-transform group-hover:translate-x-1"
              />
            </span>
          </Link>

          <p className="mt-3 text-[8px] tracking-widest text-gray-400 uppercase opacity-70 md:mt-6 md:text-[10px] md:font-bold md:opacity-60 dark:text-gray-600">
            {t('readThreads')}
          </p>
        </div>
      </div>
    </section>
  );
}

function TestimonialCard({
  name,
  role,
  avatar,
  content,
  platform,
  icon: Icon,
  color,
}: Testimonial) {
  return (
    <div className="w-[280px] shrink-0 rounded-xl border border-gray-200 bg-white/10 p-5 shadow-sm backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-gray-300 hover:shadow-md md:w-[320px] dark:border-white/10 dark:bg-neutral-900/10 dark:hover:border-white/20">
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-gray-100 text-xs font-bold text-gray-700 dark:border-white/5 dark:bg-white/10 dark:text-gray-200">
            {avatar}
          </div>
          <div>
            <div className="mb-1 text-sm leading-none font-bold text-gray-900 dark:text-white">
              {name}
            </div>
            <div className="text-[10px] font-medium tracking-wide text-gray-500 uppercase">
              {role}
            </div>
          </div>
        </div>

        <div
          className={`flex h-7 w-7 items-center justify-center rounded-full ${color}`}
        >
          <Icon size={12} />
        </div>
      </div>

      <p className="text-sm leading-relaxed font-normal text-gray-600 dark:text-gray-300">
        &quot;{content}&quot;
      </p>

      <div className="mt-3 flex items-center gap-1 font-mono text-[10px] text-gray-400 dark:text-gray-600">
        via {platform} <ExternalLink size={8} />
      </div>
    </div>
  );
}
