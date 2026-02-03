'use client';

import { motion } from 'framer-motion';
import { Crown, Plus, Sparkles } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { GradientBadge } from '@/components/ui/gradient-badge';
import type { Sponsor } from '@/lib/about/github-sponsors';
import { cn } from '@/lib/utils';

interface SponsorsWallProps {
  sponsors?: Sponsor[];
}

const MAX_SPONSORS = 10;

export function SponsorsWall({ sponsors = [] }: SponsorsWallProps) {
  const t = useTranslations('about.sponsors');
  const displaySponsors = sponsors.slice(0, MAX_SPONSORS);

  return (
    <div className="mt-16 flex w-full flex-col items-center">
      <div className="mb-4 opacity-100">
        <GradientBadge icon={Sparkles} text={t('badge')} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="group relative flex items-center rounded-full border border-gray-200 bg-white/10 p-2 shadow-sm backdrop-blur-xl transition-all duration-300 hover:border-[#1e5eff]/20 hover:shadow-lg dark:border-white/10 dark:bg-neutral-900/10 dark:hover:border-[#ff2d55]/20"
      >
        <div className="flex -space-x-3 pl-2 md:-space-x-4">
          {displaySponsors.map(sponsor => (
            <SponsorItem key={sponsor.login} sponsor={sponsor} />
          ))}

          {displaySponsors.length === 0 && (
            <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-gray-100 dark:border-black dark:bg-white/5">
              <span className="text-[8px] text-gray-400">{t('emptySlot')}</span>
            </div>
          )}
        </div>

        <div className="mx-4 h-6 w-[1px] bg-gray-200 dark:bg-white/10" />

        <Link
          href="https://github.com/sponsors/DevLoversTeam"
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('ctaAriaLabel')}
          className="group/cta relative flex h-10 w-10 items-center justify-center rounded-full border-2 border-dashed border-gray-300 bg-transparent transition-all hover:border-[#1e5eff] hover:bg-[#1e5eff]/5 dark:border-white/20 dark:hover:border-[#ff2d55] dark:hover:bg-[#ff2d55]/5"
        >
          <Plus
            size={16}
            className="text-gray-400 transition-colors group-hover/cta:text-[#1e5eff] dark:group-hover/cta:text-[#ff2d55]"
            aria-hidden="true"
          />

          <div className="pointer-events-none absolute bottom-full left-1/2 mb-3 -translate-x-1/2 rounded bg-[#1e5eff] px-2 py-1 text-[10px] font-bold whitespace-nowrap text-white opacity-0 transition-opacity group-hover/cta:opacity-100 dark:bg-[#ff2d55]">
            {t('yourSpot')}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#1e5eff] dark:border-t-[#ff2d55]" />
          </div>
        </Link>

        <Link
          href="https://github.com/sponsors/DevLoversTeam"
          target="_blank"
          rel="noopener noreferrer"
          className="mr-2 ml-3 hidden text-xs font-bold text-gray-500 transition-colors hover:text-[#1e5eff] sm:block dark:hover:text-[#ff2d55]"
        >
          {t('joinClub')}
        </Link>
      </motion.div>

      <p className="mt-4 font-mono text-[10px] text-gray-500 dark:text-neutral-500">
        {t('fundsNote')}
      </p>
    </div>
  );
}

function SponsorItem({ sponsor }: { sponsor: Sponsor }) {
  const ringColor =
    sponsor.tierColor === 'gold'
      ? 'ring-[#1e5eff] dark:ring-[#ff2d55]'
      : sponsor.tierColor === 'silver'
        ? 'ring-gray-400'
        : 'ring-orange-700/50';

  return (
    <Link
      href={`https://github.com/${sponsor.login}`}
      target="_blank"
      className="group/avatar relative z-0 transition-transform duration-200 hover:z-10 hover:-translate-y-2 hover:scale-110"
    >
      <div
        className={cn(
          'relative h-9 w-9 overflow-hidden rounded-full border-[3px] bg-gray-100 transition-all md:h-11 md:w-11 dark:bg-[#111]',
          'border-white dark:border-black',
          (sponsor.tierColor === 'gold' || sponsor.tierColor === 'silver') &&
            `ring-2 ${ringColor} ring-offset-0`
        )}
      >
        <Image
          src={sponsor.avatarUrl}
          alt={sponsor.login}
          fill
          className="object-cover"
        />

        {sponsor.tierColor === 'gold' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/10 opacity-0 transition-opacity group-hover/avatar:opacity-100">
            <Crown
              size={12}
              className="fill-white text-white"
              aria-label="Gold Tier Sponsor"
            />
          </div>
        )}
      </div>

      <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 translate-y-1 transform rounded-lg bg-gray-900 px-3 py-1.5 text-[10px] font-bold whitespace-nowrap text-white opacity-0 shadow-xl transition-all duration-200 group-hover/avatar:translate-y-0 group-hover/avatar:opacity-100 dark:bg-white dark:text-black">
        <span className="font-normal text-gray-300 dark:text-gray-500">
          @{sponsor.login}
        </span>
        <span className="mx-1.5 opacity-30">|</span>
        <span
          className={cn(
            'capitalize',
            sponsor.tierColor === 'gold'
              ? 'text-[#1e5eff] dark:text-[#ff2d55]'
              : 'text-white dark:text-black'
          )}
        >
          {sponsor.tierName}
        </span>
      </div>
    </Link>
  );
}
