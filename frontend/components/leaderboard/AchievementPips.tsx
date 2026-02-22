'use client';

import {
  Brain,
  Code,
  Crown,
  Diamond,
  Fire,
  GithubLogo,
  Heart,
  Infinity as InfinityIcon,
  Lightning,
  Medal,
  Moon,
  Rocket,
  Seal,
  Shield,
  Star,
  Target,
  Trophy,
  Waves,
} from '@phosphor-icons/react';
import { useTranslations } from 'next-intl';
import { useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

import type { Achievement, AchievementIconName } from '@/lib/achievements';

const ICON_MAP: Record<AchievementIconName, React.ElementType> = {
  Fire,
  Target,
  Lightning,
  Brain,
  Diamond,
  Star,
  Heart,
  Trophy,
  Rocket,
  Crown,
  Code,
  Infinity: InfinityIcon,
  GithubLogo,
  Medal,
  Seal,
  Moon,
  Shield,
  Waves,
};

const HEX = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)';

// Half the maximum tooltip width (generous estimate for longest badge label).
// Used to clamp the tooltip anchor so it never overflows the viewport edge.
const TOOLTIP_HALF_W = 60;

interface TooltipState {
  label: string;
  x: number;
  y: number;
}

interface AchievementPipsProps {
  achievements: Achievement[];
}

function getSponsorBadgeClasses(id: string): string {
  switch (id) {
    case 'golden_patron':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400';
    case 'silver_patron':
      return 'border-slate-400/30 bg-slate-400/10 text-slate-500 dark:text-slate-300';
    default:
      return 'border-(--accent-primary)/20 bg-(--accent-primary)/10 text-(--accent-primary)';
  }
}

export function AchievementPips({ achievements }: AchievementPipsProps) {
  const t = useTranslations('dashboard.achievements');
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const scrollResizeCleanupRef = useRef<(() => void) | null>(null);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  if (!achievements.length) return null;

  // Text pill: golden_patron > silver_patron only
  const sponsorBadge =
    achievements.find(a => a.id === 'golden_patron') ||
    achievements.find(a => a.id === 'silver_patron');

  // Hex pips: supporter + star_gazer — icon-only, clickable
  const hexPips = [
    achievements.find(a => a.id === 'supporter'),
    achievements.find(a => a.id === 'star_gazer'),
  ].filter(Boolean) as Achievement[];

  const SponsorIcon = sponsorBadge ? ICON_MAP[sponsorBadge.icon] : null;

  // Nothing to show
  if (!sponsorBadge && hexPips.length === 0) return null;

  const handleMouseEnter = (
    e: React.MouseEvent<HTMLElement>,
    achievement: Achievement
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rawX = rect.left + rect.width / 2;
    const x = Math.min(
      Math.max(rawX, TOOLTIP_HALF_W),
      window.innerWidth - TOOLTIP_HALF_W
    );
    setTooltip({ label: t(`badges.${achievement.id}.name`), x, y: rect.top });

    const hide = () => setTooltip(null);
    window.addEventListener('scroll', hide, { passive: true, capture: true });
    window.addEventListener('resize', hide, { passive: true });
    scrollResizeCleanupRef.current = () => {
      window.removeEventListener('scroll', hide, { capture: true });
      window.removeEventListener('resize', hide);
    };
  };

  const handleMouseLeave = () => {
    setTooltip(null);
    scrollResizeCleanupRef.current?.();
    scrollResizeCleanupRef.current = null;
  };

  return (
    <>
      <span className="ml-1 flex shrink-0 items-center gap-1">
        {/* ── Sponsor tier text badge (Golden Patron / Silver Patron) ── */}
        {sponsorBadge && SponsorIcon && (
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${getSponsorBadgeClasses(sponsorBadge.id)}`}
          >
            <SponsorIcon weight="fill" className="h-2.5 w-2.5 shrink-0" />
            {t(`badges.${sponsorBadge.id}.name`)}
          </span>
        )}

        {/* ── Hex pips: supporter + star_gazer ── */}
        {hexPips.length > 0 && (
          <span className="flex -space-x-1.5">
            {hexPips.map(achievement => {
              const Icon = ICON_MAP[achievement.icon];
              const [from, to] = achievement.gradient;
              const href =
                achievement.id === 'supporter'
                  ? 'https://github.com/sponsors/DevLoversTeam'
                  : 'https://github.com/DevLoversTeam/devlovers.net';
              return (
                <a
                  key={achievement.id}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative z-0 shrink-0 transition-all duration-200 hover:z-10 hover:-translate-y-1 hover:scale-110"
                  style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.35))' }}
                  onMouseEnter={e => handleMouseEnter(e, achievement)}
                  onMouseLeave={handleMouseLeave}
                  aria-label={t(`badges.${achievement.id}.name`)}
                >
                  <div
                    className="flex h-5.5 w-5.5 items-center justify-center bg-white dark:bg-neutral-900"
                    style={{ clipPath: HEX }}
                  >
                    <div
                      className="flex h-4.5 w-4.5 items-center justify-center"
                      style={{
                        clipPath: HEX,
                        background: `linear-gradient(135deg, ${from}, ${to})`,
                      }}
                    >
                      <Icon
                        weight="fill"
                        className="h-2 w-2"
                        color="rgba(255,255,255,0.95)"
                      />
                    </div>
                  </div>
                </a>
              );
            })}
          </span>
        )}
      </span>

      {/* ── Portal: hover tooltip ── */}
      {mounted &&
        tooltip &&
        createPortal(
          <div
            className="pointer-events-none fixed z-9999 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[10px] font-semibold whitespace-nowrap text-gray-700 shadow-md dark:border-white/10 dark:bg-neutral-800 dark:text-gray-200"
            style={{
              left: tooltip.x,
              top: tooltip.y - 6,
              transform: 'translateX(-50%) translateY(-100%)',
            }}
          >
            {tooltip.label}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-white dark:border-t-neutral-800" />
          </div>,
          document.body
        )}
    </>
  );
}
