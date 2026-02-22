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
  Meteor,
  Sparkle,
  GraduationCap,
  Atom,
  Sun,
  Anchor,
} from '@phosphor-icons/react';
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useEffect,useState } from 'react';

import type {
  AchievementIconName,
  EarnedAchievement,
} from '@/lib/achievements';

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
  Meteor,
  Sparkle,
  GraduationCap,
  Atom,
  Sun,
  Anchor,
};

interface AchievementBadgeProps {
  achievement: EarnedAchievement;
}

function hexPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i - 90);
    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
  }).join(' ');
}

function hexClipPath(r: number): string {
  const cx = 80;
  const cy = 80;
  const pts = Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i - 90);
    const x = ((cx + r * Math.cos(angle)) / 160) * 100;
    const y = ((cy + r * Math.sin(angle)) / 160) * 100;
    return `${x.toFixed(2)}% ${y.toFixed(2)}%`;
  });
  return `polygon(${pts.join(', ')})`;
}

const OUTER_R = 76;
const INNER_R = 68;
const CX = 80;
const CY = 80;

const outerPts = hexPoints(CX, CY, OUTER_R);
const innerPts = hexPoints(CX, CY, INNER_R);
const clipPath = hexClipPath(INNER_R - 1);

export function AchievementBadge({ achievement }: AchievementBadgeProps) {
  const t = useTranslations('dashboard.achievements');
  const [isFlipped, setIsFlipped] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    setIsDark(root.classList.contains('dark'));
    const observer = new MutationObserver(() => {
      setIsDark(root.classList.contains('dark'));
    });
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const rotateX = useTransform(y, [-60, 60], [14, -14]);
  const tiltY = useTransform(x, [-60, 60], [-14, 14]);
  const flipRotation = isFlipped ? 180 : 0;
  const rotateY = useTransform(tiltY, v => v + flipRotation);

  const springConfig = { damping: 22, stiffness: 280 };
  const rotateXSpring = useSpring(rotateX, springConfig);
  const rotateYSpring = useSpring(rotateY, springConfig);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (shouldReduceMotion || isFlipped) return;
    const rect = e.currentTarget.getBoundingClientRect();
    x.set((e.clientX - rect.left - rect.width / 2) * 1.4);
    y.set((e.clientY - rect.top - rect.height / 2) * 1.4);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  const [from, to] = achievement.gradient;
  const badgeLabel = t(`badges.${achievement.id}.name`);
  const badgeDesc = t(`badges.${achievement.id}.desc`);
  const badgeHint = t(`badges.${achievement.id}.hint`);
  const progress = achievement.progress ?? 0;

  const Icon = ICON_MAP[achievement.icon];

  const hexPerimeter = 6 * INNER_R;

  const locked = {
    bezel: isDark
      ? [
          { o: '0%', c: '#334155' },
          { o: '30%', c: '#475569' },
          { o: '60%', c: '#1e293b' },
          { o: '100%', c: '#334155' },
        ]
      : [
          { o: '0%', c: '#c8d0da' },
          { o: '25%', c: '#e8edf3' },
          { o: '55%', c: '#a8b0bc' },
          { o: '80%', c: '#dce2ea' },
          { o: '100%', c: '#b8c0cc' },
        ],
    bodyFrom: isDark ? '#1e293b' : '#eef0f4',
    bodyTo: isDark ? '#0f172a' : '#dde0e8',
    iconColor: isDark ? 'rgba(148,163,184,0.55)' : 'rgba(100,116,139,0.65)',
    iconFilter: isDark
      ? 'drop-shadow(0 1px 3px rgba(0,0,0,0.6))'
      : 'drop-shadow(0 1px 2px rgba(0,0,0,0.12))',
    bevelStroke: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    progressTrack: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    backBg: isDark
      ? 'linear-gradient(150deg, #334155, #1e293b)'
      : 'linear-gradient(150deg, #4b5563, #1f2937)',
    backShadow: isDark
      ? 'inset 0 0 20px rgba(0,0,0,0.5)'
      : 'inset 0 0 20px rgba(0,0,0,0.3)',
  };

  return (
    <div
      className="group flex flex-col items-center gap-3"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <motion.div
        className="h-20 w-20 perspective-[800px] sm:h-28 sm:w-28 md:h-[110px] md:w-[110px] xl:h-[140px] xl:w-[140px]"
        whileHover={shouldReduceMotion ? {} : { scale: 1.06 }}
        transition={{ type: 'spring', stiffness: 350, damping: 20 }}
      >
        <motion.div
          className="preserve-3d relative h-full w-full cursor-pointer"
          style={{
            rotateX: shouldReduceMotion ? 0 : rotateXSpring,
            rotateY: shouldReduceMotion ? flipRotation : rotateYSpring,
          }}
          onClick={() => setIsFlipped(p => !p)}
          role="button"
          tabIndex={0}
          aria-label={`${badgeLabel}. ${isFlipped ? t('ui.clickBack') : t('ui.clickInfo')}`}
          onKeyDown={e => {
            if (e.key === ' ' || e.key === 'Enter') {
              e.preventDefault();
              setIsFlipped(p => !p);
            }
          }}
        >
          <div className="absolute inset-0 backface-hidden">
            <svg
              viewBox="0 0 160 160"
              className="absolute inset-0 h-full w-full overflow-visible"
              aria-hidden="true"
            >
              <defs>
                <linearGradient
                  id={`metal-${achievement.id}`}
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="100%"
                >
                  {achievement.earned ? (
                    <>
                      <stop offset="0%" stopColor="#d8d8d8" />
                      <stop offset="22%" stopColor="#ffffff" />
                      <stop offset="48%" stopColor="#b0b0b0" />
                      <stop offset="72%" stopColor="#eeeeee" />
                      <stop offset="100%" stopColor="#cccccc" />
                    </>
                  ) : (
                    <>
                      {locked.bezel.map(s => (
                        <stop key={s.o} offset={s.o} stopColor={s.c} />
                      ))}
                    </>
                  )}
                </linearGradient>

                <linearGradient
                  id={`body-${achievement.id}`}
                  x1="20%"
                  y1="0%"
                  x2="80%"
                  y2="100%"
                >
                  <stop
                    offset="0%"
                    stopColor={achievement.earned ? from : locked.bodyFrom}
                  />
                  <stop
                    offset="100%"
                    stopColor={achievement.earned ? to : locked.bodyTo}
                  />
                </linearGradient>

                <radialGradient
                  id={`hl-${achievement.id}`}
                  cx="35%"
                  cy="25%"
                  r="55%"
                >
                  <stop
                    offset="0%"
                    stopColor={
                      achievement.earned
                        ? 'rgba(255,255,255,0.28)'
                        : 'rgba(255,255,255,0.0)'
                    }
                  />
                  <stop offset="100%" stopColor="rgba(0,0,0,0)" />
                </radialGradient>

                <linearGradient
                  id={`arc-${achievement.id}`}
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="0%"
                >
                  <stop offset="0%" stopColor={from} />
                  <stop offset="100%" stopColor={to} />
                </linearGradient>

                <linearGradient
                  id={`shine-${achievement.id}`}
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="100%"
                >
                  <stop offset="0%" stopColor="rgba(255,255,255,0.85)" />
                  <stop offset="35%" stopColor="rgba(255,255,255,0.1)" />
                  <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                </linearGradient>

                <filter
                  id={`shadow-${achievement.id}`}
                  x="-20%"
                  y="-20%"
                  width="140%"
                  height="140%"
                >
                  <feDropShadow
                    dx="0"
                    dy="5"
                    stdDeviation="7"
                    floodColor="rgba(0,0,0,0.6)"
                  />
                </filter>

                <filter
                  id={`glow-${achievement.id}`}
                  x="-50%"
                  y="-50%"
                  width="200%"
                  height="200%"
                >
                  <feGaussianBlur stdDeviation="7" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              <polygon
                points={outerPts}
                fill={`url(#metal-${achievement.id})`}
                filter={`url(#shadow-${achievement.id})`}
              />

              <polygon
                points={innerPts}
                fill={`url(#body-${achievement.id})`}
              />

              {achievement.earned && (
                <polygon
                  points={innerPts}
                  fill={`url(#hl-${achievement.id})`}
                />
              )}

              <polygon
                points={innerPts}
                fill="none"
                stroke={
                  achievement.earned ? 'rgba(0,0,0,0.18)' : locked.bevelStroke
                }
                strokeWidth="2"
              />

              {!achievement.earned && (
                <polygon
                  points={innerPts}
                  fill="none"
                  stroke={locked.progressTrack}
                  strokeWidth="8"
                />
              )}

              {!achievement.earned && progress > 0 && (
                <polygon
                  points={innerPts}
                  fill="none"
                  stroke={`url(#arc-${achievement.id})`}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={hexPerimeter}
                  strokeDashoffset={hexPerimeter * (1 - progress / 100)}
                />
              )}

              {achievement.earned && (
                <polygon
                  points={outerPts}
                  fill="none"
                  stroke={achievement.glow}
                  strokeWidth="6"
                  strokeOpacity="0.7"
                  filter={`url(#glow-${achievement.id})`}
                />
              )}

              <polygon
                points={outerPts}
                fill="none"
                stroke={`url(#shine-${achievement.id})`}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`${OUTER_R * 1.6} ${OUTER_R * 10}`}
                strokeDashoffset={`${-OUTER_R * 0.2}`}
              />
            </svg>

            <div className="absolute inset-0 flex items-center justify-center">
              <Icon
                weight={achievement.earned ? 'fill' : 'regular'}
                className="h-8 w-8 sm:h-10 sm:w-10 md:h-10 md:w-10 xl:h-[52px] xl:w-[52px]"
                color={
                  achievement.earned
                    ? 'rgba(255,255,255,0.97)'
                    : locked.iconColor
                }
                style={{
                  filter: achievement.earned
                    ? `drop-shadow(0 0 10px ${achievement.glow}) drop-shadow(0 2px 5px rgba(0,0,0,0.6))`
                    : locked.iconFilter,
                }}
              />
            </div>
          </div>

          <div className="absolute inset-0 [transform:rotateY(180deg)] backface-hidden">
            <svg
              viewBox="0 0 160 160"
              className="absolute inset-0 h-full w-full overflow-visible"
              aria-hidden="true"
            >
              <defs>
                <linearGradient
                  id={`back-body-${achievement.id}`}
                  x1="20%"
                  y1="0%"
                  x2="80%"
                  y2="100%"
                >
                  {achievement.earned ? (
                    <>
                      <stop offset="0%" stopColor={`${from}ee`} />
                      <stop offset="100%" stopColor={`${to}cc`} />
                    </>
                  ) : (
                    <>
                      <stop
                        offset="0%"
                        stopColor={isDark ? '#334155' : '#94a3b8'}
                      />
                      <stop
                        offset="100%"
                        stopColor={isDark ? '#1e293b' : '#64748b'}
                      />
                    </>
                  )}
                </linearGradient>
                <radialGradient
                  id={`back-hl-${achievement.id}`}
                  cx="38%"
                  cy="22%"
                  r="55%"
                >
                  <stop offset="0%" stopColor="rgba(255,255,255,0.22)" />
                  <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                </radialGradient>
                <filter
                  id={`back-shadow-${achievement.id}`}
                  x="-20%"
                  y="-20%"
                  width="140%"
                  height="140%"
                >
                  <feDropShadow
                    dx="0"
                    dy="4"
                    stdDeviation="6"
                    floodColor="rgba(0,0,0,0.5)"
                  />
                </filter>
                {achievement.earned && (
                  <filter
                    id={`back-glow-${achievement.id}`}
                    x="-50%"
                    y="-50%"
                    width="200%"
                    height="200%"
                  >
                    <feGaussianBlur stdDeviation="6" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                )}
                <linearGradient
                  id={`back-shine-${achievement.id}`}
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="100%"
                >
                  <stop offset="0%" stopColor="rgba(255,255,255,0.85)" />
                  <stop offset="35%" stopColor="rgba(255,255,255,0.1)" />
                  <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                </linearGradient>
                {!achievement.earned && progress > 0 && (
                  <clipPath id={`progress-clip-${achievement.id}`}>
                    <rect
                      x="35"
                      y="0"
                      width={`${progress * 0.9}`}
                      height="5"
                      rx="2.5"
                    />
                  </clipPath>
                )}
              </defs>

              <polygon
                points={outerPts}
                fill={`url(#metal-${achievement.id})`}
                filter={`url(#back-shadow-${achievement.id})`}
              />

              <polygon
                points={innerPts}
                fill={`url(#back-body-${achievement.id})`}
              />

              <polygon
                points={innerPts}
                fill={`url(#back-hl-${achievement.id})`}
              />
              {achievement.earned && (
                <polygon
                  points={outerPts}
                  fill="none"
                  stroke={achievement.glow}
                  strokeWidth="5"
                  strokeOpacity="0.6"
                  filter={`url(#back-glow-${achievement.id})`}
                />
              )}

              <polygon
                points={outerPts}
                fill="none"
                stroke={`url(#back-shine-${achievement.id})`}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`${OUTER_R * 1.6} ${OUTER_R * 10}`}
                strokeDashoffset={`${-OUTER_R * 0.2}`}
              />

              <foreignObject x="16" y="30" width="128" height="105">
                <div
                  // @ts-expect-error — xmlns needed for SVG foreignObject
                  xmlns="http://www.w3.org/1999/xhtml"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    gap: '5px',
                    textAlign: 'center',
                    fontFamily: 'system-ui, sans-serif',
                  }}
                >
                  <p
                    style={{
                      fontSize: '9px',
                      fontWeight: 900,
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      color: 'rgba(255,255,255,0.95)',
                      lineHeight: 1.2,
                      margin: 0,
                    }}
                  >
                    {badgeLabel}
                  </p>

                  <div
                    style={{
                      width: '28px',
                      height: '1px',
                      background: 'rgba(255,255,255,0.35)',
                      flexShrink: 0,
                    }}
                  />

                  <p
                    style={{
                      fontSize: '8px',
                      fontWeight: 500,
                      color: 'rgba(255,255,255,0.82)',
                      lineHeight: 1.45,
                      margin: 0,
                      maxWidth: '100px',
                    }}
                  >
                    {achievement.earned ? badgeDesc : badgeHint}
                  </p>

                  {!achievement.earned && progress > 0 && (
                    <div style={{ width: '80px', marginTop: '4px' }}>
                      <div
                        style={{
                          height: '4px',
                          background: 'rgba(255,255,255,0.15)',
                          borderRadius: '2px',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            width: `${progress}%`,
                            background: `linear-gradient(90deg, ${from}, ${to})`,
                            borderRadius: '2px',
                          }}
                        />
                      </div>
                      <p
                        style={{
                          fontSize: '7px',
                          fontWeight: 700,
                          color: 'rgba(255,255,255,0.55)',
                          marginTop: '2px',
                          letterSpacing: '0.05em',
                        }}
                      >
                        {Math.round(progress)}%
                      </p>
                    </div>
                  )}

                  {achievement.earned && achievement.earnedAt && (
                    <p
                      style={{
                        fontSize: '7px',
                        fontWeight: 500,
                        color: 'rgba(255,255,255,0.5)',
                        marginTop: '1px',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {achievement.earnedAt}
                    </p>
                  )}
                </div>
              </foreignObject>
            </svg>
          </div>
        </motion.div>
      </motion.div>

      <p className="max-w-[140px] text-center text-[10.5px] leading-tight font-bold tracking-wider text-balance uppercase">
        <span
          style={{ color: achievement.earned ? from : undefined }}
          className={
            achievement.earned ? '' : 'text-neutral-400 dark:text-neutral-500'
          }
        >
          {badgeLabel}
        </span>
      </p>
    </div>
  );
}
