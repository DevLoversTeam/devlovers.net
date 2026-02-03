'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  Brain,
  CalendarDays,
  Clock,
  Cpu,
  CreditCard,
  Flame,
  Globe,
  History,
  Languages,
  Lightbulb,
  LucideIcon,
  Medal,
  MessageCircle,
  Package,
  PenTool,
  Save,
  Search,
  Shield,
  ShoppingBag,
  Sparkles,
  Tag,
  Target,
  TrendingUp,
  Trophy,
  User,
  UserCircle,
  Users,
  Zap,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect,useState } from 'react';

import { SectionHeading } from '@/components/ui/section-heading';
import { Link } from '@/i18n/routing';

interface Feature {
  icon: LucideIcon;
  labelKey: string;
  descKey: string;
  x: number;
  y: number;
  size: number;
}

interface Page {
  id: string;
  icon: LucideIcon;
  href: string;
  features: Feature[];
}

const decorativeDots = [
  { x: '5%', y: '20%', size: 8 },
  { x: '10%', y: '75%', size: 6 },
  { x: '18%', y: '40%', size: 5 },
  { x: '92%', y: '25%', size: 7 },
  { x: '88%', y: '70%', size: 6 },
  { x: '82%', y: '45%', size: 5 },
  { x: '7%', y: '55%', size: 7 },
  { x: '95%', y: '55%', size: 8 },
  { x: '15%', y: '85%', size: 6 },
  { x: '85%', y: '15%', size: 5 },
  { x: '3%', y: '35%', size: 6 },
  { x: '97%', y: '80%', size: 7 },
];

const pages: Page[] = [
  {
    id: 'qa',
    icon: MessageCircle,
    href: '/q&a',
    features: [
      {
        icon: Globe,
        labelKey: 'bubbles.qa.languages.label',
        descKey: 'bubbles.qa.languages.desc',
        x: -120,
        y: -120,
        size: 88,
      },
      {
        icon: Cpu,
        labelKey: 'bubbles.qa.aiHelper.label',
        descKey: 'bubbles.qa.aiHelper.desc',
        x: 120,
        y: -120,
        size: 88,
      },
      {
        icon: Lightbulb,
        labelKey: 'bubbles.qa.smartCache.label',
        descKey: 'bubbles.qa.smartCache.desc',
        x: -120,
        y: 120,
        size: 88,
      },
      {
        icon: Search,
        labelKey: 'bubbles.qa.techFilter.label',
        descKey: 'bubbles.qa.techFilter.desc',
        x: 120,
        y: 120,
        size: 88,
      },
    ],
  },
  {
    id: 'quiz',
    icon: Brain,
    href: '/quizzes',
    features: [
      {
        icon: Clock,
        labelKey: 'bubbles.quiz.smartTimer.label',
        descKey: 'bubbles.quiz.smartTimer.desc',
        x: -120,
        y: -120,
        size: 88,
      },
      {
        icon: Shield,
        labelKey: 'bubbles.quiz.antiCheat.label',
        descKey: 'bubbles.quiz.antiCheat.desc',
        x: 120,
        y: -120,
        size: 88,
      },
      {
        icon: Save,
        labelKey: 'bubbles.quiz.autoSync.label',
        descKey: 'bubbles.quiz.autoSync.desc',
        x: -120,
        y: 120,
        size: 88,
      },
      {
        icon: BarChart3,
        labelKey: 'bubbles.quiz.tracking.label',
        descKey: 'bubbles.quiz.tracking.desc',
        x: 120,
        y: 120,
        size: 88,
      },
    ],
  },
  {
    id: 'leaderboard',
    icon: Trophy,
    href: '/leaderboard',
    features: [
      {
        icon: Medal,
        labelKey: 'bubbles.leaderboard.podium.label',
        descKey: 'bubbles.leaderboard.podium.desc',
        x: -120,
        y: -120,
        size: 88,
      },
      {
        icon: Globe,
        labelKey: 'bubbles.leaderboard.globalRank.label',
        descKey: 'bubbles.leaderboard.globalRank.desc',
        x: 120,
        y: -120,
        size: 88,
      },
      {
        icon: Zap,
        labelKey: 'bubbles.leaderboard.xpSystem.label',
        descKey: 'bubbles.leaderboard.xpSystem.desc',
        x: -120,
        y: 120,
        size: 88,
      },
      {
        icon: Activity,
        labelKey: 'bubbles.leaderboard.liveFeed.label',
        descKey: 'bubbles.leaderboard.liveFeed.desc',
        x: 120,
        y: 120,
        size: 88,
      },
    ],
  },
  {
    id: 'profile',
    icon: User,
    href: '/dashboard',
    features: [
      {
        icon: BarChart3,
        labelKey: 'bubbles.profile.statsHub.label',
        descKey: 'bubbles.profile.statsHub.desc',
        x: -120,
        y: -120,
        size: 88,
      },
      {
        icon: History,
        labelKey: 'bubbles.profile.history.label',
        descKey: 'bubbles.profile.history.desc',
        x: 120,
        y: -120,
        size: 88,
      },
      {
        icon: UserCircle,
        labelKey: 'bubbles.profile.identity.label',
        descKey: 'bubbles.profile.identity.desc',
        x: -120,
        y: 120,
        size: 88,
      },
      {
        icon: Bell,
        labelKey: 'bubbles.profile.reminders.label',
        descKey: 'bubbles.profile.reminders.desc',
        x: 120,
        y: 120,
        size: 88,
      },
    ],
  },
  {
    id: 'blog',
    icon: BookOpen,
    href: '/blog',
    features: [
      {
        icon: TrendingUp,
        labelKey: 'bubbles.blog.techTrends.label',
        descKey: 'bubbles.blog.techTrends.desc',
        x: -120,
        y: -120,
        size: 88,
      },
      {
        icon: PenTool,
        labelKey: 'bubbles.blog.tutorials.label',
        descKey: 'bubbles.blog.tutorials.desc',
        x: 120,
        y: -120,
        size: 88,
      },
      {
        icon: BookOpen,
        labelKey: 'bubbles.blog.deepDives.label',
        descKey: 'bubbles.blog.deepDives.desc',
        x: -120,
        y: 120,
        size: 88,
      },
      {
        icon: Users,
        labelKey: 'bubbles.blog.community.label',
        descKey: 'bubbles.blog.community.desc',
        x: 120,
        y: 120,
        size: 88,
      },
    ],
  },
  {
    id: 'shop',
    icon: ShoppingBag,
    href: '/shop',
    features: [
      {
        icon: Sparkles,
        labelKey: 'bubbles.shop.newDrops.label',
        descKey: 'bubbles.shop.newDrops.desc',
        x: -120,
        y: -120,
        size: 88,
      },
      {
        icon: Tag,
        labelKey: 'bubbles.shop.curated.label',
        descKey: 'bubbles.shop.curated.desc',
        x: 120,
        y: -120,
        size: 88,
      },
      {
        icon: CreditCard,
        labelKey: 'bubbles.shop.checkout.label',
        descKey: 'bubbles.shop.checkout.desc',
        x: -120,
        y: 120,
        size: 88,
      },
      {
        icon: Package,
        labelKey: 'bubbles.shop.premium.label',
        descKey: 'bubbles.shop.premium.desc',
        x: 120,
        y: 120,
        size: 88,
      },
    ],
  },
];

function FeatureBubble({
  feature,
  index,
  href,
  isMobile,
  t,
}: {
  feature: Feature;
  index: number;
  href: string;
  isMobile: boolean;
  t: (key: string) => string;
}) {
  const Icon = feature.icon;
  const floatDelay = index * 0.5;
  const floatDuration = 3 + index * 0.3;

  const scaleX = isMobile ? 0.55 : 1;
  const scaleY = isMobile ? 1.3 : 1;
  const posX = feature.x * scaleX;
  const posY = feature.y * scaleY;

  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      className="absolute"
      style={{ left: '50%', top: '50%' }}
      initial={{ x: '-50%', y: '-50%', opacity: 0, scale: 0 }}
      animate={{
        x: `calc(-50% + ${posX}%)`,
        y: `calc(-50% + ${posY}%)`,
        opacity: 1,
        scale: 1,
      }}
      exit={{ x: '-50%', y: '-50%', opacity: 0, scale: 0 }}
      transition={
        shouldReduceMotion
          ? { duration: 0 }
          : {
              x: {
                delay: 0.1 + index * 0.08,
                duration: 0.6,
                type: 'spring',
                bounce: 0.3,
              },
              y: {
                delay: 0.1 + index * 0.08,
                duration: 0.6,
                type: 'spring',
                bounce: 0.3,
              },
              opacity: { delay: 0.1 + index * 0.08, duration: 0.3 },
              scale: {
                delay: 0.1 + index * 0.08,
                duration: 0.5,
                type: 'spring',
                bounce: 0.4,
              },
            }
      }
    >
      <div
        className="animate-float motion-reduce:animate-none"
        style={{
          animationDelay: `${floatDelay}s`,
          animationDuration: `${floatDuration}s`,
        }}
      >
        <Link href={href} className="group block">
          <div className="flex w-[140px] cursor-pointer items-center gap-2 rounded-xl border border-gray-200 bg-white px-2 py-2 shadow-lg transition-all duration-200 group-hover:scale-105 group-hover:border-[#1e5eff]/40 group-hover:shadow-[0_8px_30px_rgba(30,94,255,0.25)] md:w-[180px] md:gap-3 md:rounded-2xl md:px-3 md:py-2.5 dark:border-white/10 dark:bg-neutral-900 dark:shadow-black/30 dark:group-hover:border-[#ff2d55]/40 dark:group-hover:shadow-[0_8px_30px_rgba(255,45,85,0.25)]">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1e5eff]/10 transition-transform duration-200 group-hover:scale-110 group-hover:rotate-6 md:h-10 md:w-10 md:rounded-xl dark:bg-[#ff2d55]/10">
              <Icon
                className="h-4 w-4 text-[#1e5eff] md:h-5 md:w-5 dark:text-[#ff2d55]"
                strokeWidth={1.5}
              />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-gray-800 md:text-sm dark:text-white">
                {t(feature.labelKey)}
              </div>
              <div className="text-[10px] text-gray-500 md:text-xs dark:text-gray-400">
                {t(feature.descKey)}
              </div>
            </div>
          </div>
        </Link>
      </div>
    </motion.div>
  );
}

function CentralIcon({ page }: { page: Page }) {
  const Icon = page.icon;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ duration: 0.5, type: 'spring', bounce: 0.3 }}
      className="relative z-30 flex items-center justify-center"
    >
      <motion.div
        className="absolute h-60 w-60 rounded-full blur-3xl"
        animate={{ opacity: [0.15, 0.25, 0.15], scale: [1, 1.1, 1] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div className="h-full w-full rounded-full bg-[#1e5eff] dark:bg-[#ff2d55]" />
      </motion.div>

      <div className="relative flex h-36 w-36 items-center justify-center rounded-full border border-gray-100 bg-white/80 shadow-2xl backdrop-blur-xl md:h-40 md:w-40 dark:border-white/10 dark:bg-neutral-900/60 dark:shadow-black/40">
        <div className="absolute inset-2 rounded-full bg-gradient-to-br from-[#1e5eff]/10 to-[#1e5eff]/5 dark:from-[#ff2d55]/10 dark:to-[#ff2d55]/5" />
        <Icon
          className="relative z-10 h-16 w-16 text-[#1e5eff] dark:text-[#ff2d55]"
          strokeWidth={1.5}
        />
      </div>
    </motion.div>
  );
}

function DecorativeDots() {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-0"
      aria-hidden="true"
    >
      {decorativeDots.map((dot, i) => (
        <div
          key={i}
          className="animate-float absolute rounded-full bg-[#1e5eff]/40 dark:bg-[#ff2d55]/40"
          style={{
            left: dot.x,
            top: dot.y,
            width: dot.size,
            height: dot.size,
            animationDelay: `${i * 0.3}s`,
            animationDuration: `${3 + i * 0.2}s`,
          }}
        />
      ))}
    </div>
  );
}

function OrbitRings() {
  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
      aria-hidden="true"
    >
      <div className="animate-spin-slow absolute h-[55%] w-[55%] rounded-full border border-dashed border-gray-300/50 dark:border-white/10" />
      <div className="animate-spin-slower absolute h-[75%] w-[75%] rounded-full border border-dashed border-gray-200/50 dark:border-white/[0.07]" />
      <div className="absolute h-[95%] w-[95%] rounded-full border border-gray-100/50 dark:border-white/[0.03]" />
    </div>
  );
}

function ConnectingLines() {
  const lines = [
    { x2: '15%', y2: '15%', delay: '0s' },
    { x2: '85%', y2: '15%', delay: '0.5s' },
    { x2: '15%', y2: '85%', delay: '1s' },
    { x2: '85%', y2: '85%', delay: '1.5s' },
  ];

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop
            offset="0%"
            className="[stop-color:#1e5eff] dark:[stop-color:#ff2d55]"
            stopOpacity="0.3"
          />
          <stop
            offset="100%"
            className="[stop-color:#1e5eff] dark:[stop-color:#ff2d55]"
            stopOpacity="0"
          />
        </linearGradient>
      </defs>
      {lines.map((line, i) => (
        <line
          key={i}
          x1="50%"
          y1="50%"
          x2={line.x2}
          y2={line.y2}
          stroke="url(#lineGradient)"
          strokeWidth="1"
          strokeDasharray="4 4"
          className="animate-dash-flow"
          style={{ animationDelay: line.delay }}
        />
      ))}
    </svg>
  );
}

function TabButton({
  page,
  isActive,
  onClick,
  onKeyDown,
  t,
}: {
  page: Page;
  isActive: boolean;
  onClick: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
  t: (key: string) => string;
}) {
  return (
    <button
      type="button"
      id={`${page.id}-tab`}
      onClick={onClick}
      onKeyDown={onKeyDown}
      role="tab"
      aria-selected={isActive}
      aria-controls={`${page.id}-panel`}
      tabIndex={isActive ? 0 : -1}
      className={`relative rounded-full p-2.5 text-sm font-medium transition-all duration-300 md:px-5 md:py-2.5 ${
        isActive
          ? 'text-white'
          : 'text-gray-600 hover:bg-gray-100 hover:text-black dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white'
      }`}
    >
      {isActive && (
        <motion.div
          layoutId="activeTabBackground"
          className="absolute inset-0 bg-[#1e5eff] shadow-lg shadow-[#1e5eff]/25 dark:bg-[#ff2d55] dark:shadow-[#ff2d55]/25"
          initial={false}
          transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
          style={{ borderRadius: 9999 }}
        />
      )}
      <span className="relative z-10 flex items-center gap-2">
        <page.icon size={18} className="md:h-4 md:w-4" aria-hidden="true" />
        <span className="hidden md:inline">{t(`${page.id}.title`)}</span>
      </span>
    </button>
  );
}

export function FeaturesSection() {
  const t = useTranslations('about.features');
  const [activeTab, setActiveTab] = useState('qa');
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  const activePage = pages.find(p => p.id === activeTab) || pages[0];

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const onTabKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number
  ) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const dir = event.key === 'ArrowRight' ? 1 : -1;
    const nextIndex = (index + dir + pages.length) % pages.length;
    const nextId = pages[nextIndex].id;
    setActiveTab(nextId);
    setTimeout(() => {
      document.getElementById(`${nextId}-tab`)?.focus();
    }, 0);
  };

  return (
    <section className="relative w-full overflow-hidden bg-gray-50 py-20 lg:py-28 dark:bg-transparent">
      <DecorativeDots />

      <div
        className="pointer-events-none absolute inset-0 -z-10"
        aria-hidden="true"
      >
        <div className="absolute top-1/2 left-1/2 h-[400px] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#1e5eff]/20 opacity-20 blur-[150px] dark:bg-[#ff2d55]/20" />
      </div>

      <div className="container-main relative z-10 flex flex-col items-center">
        <SectionHeading
          title={t('title')}
          highlight={t('titleHighlight')}
          subtitle={t('subtitle')}
        />

        <div className="relative mx-auto mb-4 aspect-square w-full max-w-md">
          <OrbitRings />
          <ConnectingLines />

          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
            <AnimatePresence mode="wait">
              <CentralIcon key={activeTab} page={activePage} />
            </AnimatePresence>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              role="tabpanel"
              id={`${activeTab}-panel`}
              aria-labelledby={`${activeTab}-tab`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0"
            >
              {activePage.features.map((feature, i) => (
                <FeatureBubble
                  key={feature.labelKey}
                  feature={feature}
                  index={i}
                  href={activePage.href}
                  isMobile={isMobile}
                  t={t}
                />
              ))}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mb-8 flex justify-center">
          <div
            role="tablist"
            aria-label="Feature categories"
            className="inline-flex gap-1 rounded-full border border-gray-200 bg-white/20 p-1.5 shadow-sm backdrop-blur-md md:gap-2 dark:border-white/10 dark:bg-white/5 dark:shadow-none"
          >
            {pages.map((page, index) => (
              <TabButton
                key={page.id}
                page={page}
                isActive={activeTab === page.id}
                onClick={() => setActiveTab(page.id)}
                onKeyDown={e => onTabKeyDown(e, index)}
                t={t}
              />
            ))}
          </div>
        </div>

        <div className="relative mx-auto mb-4 h-20 w-full max-w-2xl text-center md:h-16">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="absolute top-0 left-0 flex w-full justify-center"
            >
              <p className="text-base leading-relaxed font-light text-gray-600 md:text-lg dark:text-gray-300">
                {t(`${activeTab}.description`)}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
