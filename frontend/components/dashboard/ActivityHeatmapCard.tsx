'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Activity, CalendarDays, ChevronDown, Flame } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';

interface ActivityHeatmapCardProps {
  attempts: {
    percentage: string;
    score: number;
    completedAt: Date;
  }[];
  locale: string;
  currentStreak?: number;
}

export function ActivityHeatmapCard({
  attempts,
  locale,
  currentStreak,
}: ActivityHeatmapCardProps) {
  const t = useTranslations('dashboard.stats');
  const tProfile = useTranslations('dashboard.profile');
  const periodDays = 90;
  const [periodOffset, setPeriodOffset] = useState(0);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollLeft =
          scrollContainerRef.current.scrollWidth;
      }
    }, 10);
    return () => clearTimeout(timer);
  }, [periodOffset]);

  const [tooltip, setTooltip] = useState<{
    count: number;
    date: Date;
    top: number;
    left: number;
  } | null>(null);

  const cardStyles = 'dashboard-card flex flex-col justify-between p-6 sm:p-8';

  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const { windowStart, windowEnd } = useMemo(() => {
    const end = new Date(todayStart);
    if (periodOffset > 0) {
      end.setDate(1);
      end.setMonth(end.getMonth() - periodOffset * 4 + 1);
      end.setDate(0);
    }

    const start = new Date(end);
    start.setDate(1);
    start.setMonth(end.getMonth() - 3);

    const windowEndExclusive = new Date(end);
    if (periodOffset === 0) {
      windowEndExclusive.setDate(windowEndExclusive.getDate() + 1);
    } else {
      windowEndExclusive.setDate(windowEndExclusive.getDate() + 1);
    }
    return { windowStart: start, windowEnd: windowEndExclusive };
  }, [todayStart, periodOffset]);

  const totalAttemptsInPeriod = useMemo(() => {
    return attempts.filter(a => {
      const d = new Date(a.completedAt);
      return d >= windowStart && d < windowEnd;
    }).length;
  }, [attempts, windowStart, windowEnd]);

  const { heatmapData } = useMemo(() => {
    const countsByDate = new Map<string, number>();
    attempts.forEach(attempt => {
      const d = new Date(attempt.completedAt);
      if (d >= windowStart && d < windowEnd) {
        const dateKey = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
        countsByDate.set(dateKey, (countsByDate.get(dateKey) || 0) + 1);
      }
    });

    const data: { date: Date; count: number }[] = [];
    const curr = new Date(windowStart);
    while (curr < windowEnd) {
      const dateKey = `${curr.getFullYear()}-${curr.getMonth() + 1}-${curr.getDate()}`;
      data.push({
        date: new Date(curr),
        count: countsByDate.get(dateKey) || 0,
      });
      curr.setDate(curr.getDate() + 1);
    }

    return { heatmapData: data };
  }, [attempts, windowStart, windowEnd]);

  const periodOptions = useMemo(() => {
    return [0, 1, 2].map(offset => {
      const end = new Date(todayStart);
      if (offset > 0) {
        end.setDate(1);
        end.setMonth(end.getMonth() - offset * 4 + 1);
        end.setDate(0);
      }
      const start = new Date(end);
      start.setDate(1);
      start.setMonth(end.getMonth() - 3);

      const formatMonthYr = (d: Date) =>
        d.toLocaleString(locale, { month: 'short' }) +
        ' ' +
        String(d.getFullYear()).slice(-2);
      const label = `${formatMonthYr(start)} - ${formatMonthYr(end)}`;

      return { label, value: offset };
    });
  }, [locale, todayStart]);

  const { monthsData, totalActiveDays } = useMemo(() => {
    const groups: {
      monthStr: string;
      year: number;
      month: number;
      days: { date: Date; count: number }[];
      activeCount: number;
    }[] = [];
    let currentGroup: {
      monthStr: string;
      year: number;
      month: number;
      days: { date: Date; count: number }[];
      activeCount: number;
    } | null = null;
    let totalActive = 0;

    heatmapData.forEach(d => {
      const month = d.date.getMonth();
      const year = d.date.getFullYear();
      if (
        !currentGroup ||
        currentGroup.month !== month ||
        currentGroup.year !== year
      ) {
        if (currentGroup) groups.push(currentGroup);
        currentGroup = {
          monthStr: d.date.toLocaleString(locale, { month: 'short' }),
          year,
          month,
          days: [],
          activeCount: 0,
        };
      }
      currentGroup.days.push(d);
      if (d.count > 0) {
        currentGroup.activeCount++;
        totalActive++;
      }
    });
    if (currentGroup) groups.push(currentGroup);

    return { monthsData: groups, totalActiveDays: totalActive };
  }, [heatmapData, locale]);

  const { todayKey } = useMemo(() => {
    let streak = 0,
      max = 0;
    for (const d of heatmapData) {
      if (d.count > 0) {
        streak++;
        max = Math.max(max, streak);
      } else streak = 0;
    }
    const td = new Date();
    return {
      todayKey: `${td.getFullYear()}-${td.getMonth() + 1}-${td.getDate()}`,
    };
  }, [heatmapData]);

  const { nodes, traces, svgHeight, svgWidth } = useMemo(() => {
    const ROW_H = 34;
    const COL_W = 18;
    const PAD_L = 40;
    const PAD_T = 16;

    const monthRowMap = new Map<string, number>();
    monthsData.forEach((m, i) => monthRowMap.set(`${m.year}-${m.month}`, i));

    type Node = {
      x: number;
      y: number;
      date: Date;
      count: number;
      isToday: boolean;
      isPartOfStreak?: boolean;
      streakCount?: number;
    };
    const allNodes: Node[] = [];
    const tracesArr: {
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      count: number;
      isStreak: boolean;
    }[] = [];

    heatmapData.forEach(day => {
      const yrMap = `${day.date.getFullYear()}-${day.date.getMonth()}`;
      const rowIdx = monthRowMap.get(yrMap) ?? 0;
      const colIdx = day.date.getDate() - 1; // 0 to 30

      const x = PAD_L + colIdx * COL_W;
      const y = PAD_T + rowIdx * ROW_H;
      const isToday =
        `${day.date.getFullYear()}-${day.date.getMonth() + 1}-${day.date.getDate()}` ===
        todayKey;

      allNodes.push({ x, y, date: day.date, count: day.count, isToday });
    });

    let currentStreakCount = 0;
    allNodes.forEach(n => {
      if (n.count > 0) currentStreakCount++;
      else currentStreakCount = 0;
      n.streakCount = currentStreakCount;
    });

    let inStreak = false;
    for (let i = allNodes.length - 1; i >= 0; i--) {
      if ((allNodes[i].streakCount || 0) > 1) inStreak = true;
      if (allNodes[i].count === 0) inStreak = false;
      allNodes[i].isPartOfStreak =
        inStreak || (allNodes[i].streakCount || 0) > 1;
    }

    for (let i = 1; i < allNodes.length; i++) {
      const prev = allNodes[i - 1];
      const curr = allNodes[i];
      if (prev.count > 0 && curr.count > 0) {
        tracesArr.push({
          x1: prev.x,
          y1: prev.y,
          x2: curr.x,
          y2: curr.y,
          count: curr.count,
          isStreak: Boolean(prev.isPartOfStreak && curr.isPartOfStreak),
        });
      }
    }

    const svgW = PAD_L + 31 * COL_W + 16;
    const svgH = Math.max(140, PAD_T + monthsData.length * ROW_H + 10);

    return {
      nodes: allNodes,
      traces: tracesArr,
      svgHeight: svgH,
      svgWidth: svgW,
    };
  }, [heatmapData, monthsData, todayKey]);

  const getTracePath = (x1: number, y1: number, x2: number, y2: number) => {
    if (y1 === y2) return `M ${x1} ${y1} L ${x2} ${y2}`;
    const midY = y1 + (y2 - y1) / 2;
    return `M ${x1} ${y1} L ${x1 + 6} ${y1} L ${x1 + 6} ${midY} L ${x2 - 6} ${midY} L ${x2 - 6} ${y2} L ${x2} ${y2}`;
  };

  const getCircuitColor = (count: number) => {
    if (count > 0) return 'var(--accent-primary)';
    return 'currentColor'; // fallback
  };
  const getCircuitOpacity = (count: number) => {
    if (count === 1) return 0.4;
    if (count === 2) return 0.7;
    if (count >= 3) return 1;
    return 1;
  };
  const getCircuitGlow = (count: number) => {
    if (count > 0) return 'url(#neonGlow)';
    return 'none';
  };

  return (
    <section className={cardStyles} aria-labelledby="heatmap-heading">
      <div className="flex h-full flex-col">
        <div className="mb-4 flex w-full min-w-0 flex-row items-start justify-between gap-3 sm:mb-6 sm:items-center sm:gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="shrink-0 rounded-xl bg-gray-100/50 p-3 ring-1 ring-black/5 dark:bg-neutral-800/50 dark:ring-white/10"
              aria-hidden="true"
            >
              <Activity className="h-5 w-5 text-(--accent-primary) drop-shadow-[0_0_8px_rgba(var(--accent-primary-rgb),0.6)]" />
            </div>
            <div className="min-w-0">
              <h3
                id="heatmap-heading"
                className="text-lg leading-tight font-bold text-gray-900 sm:text-xl dark:text-white"
              >
                {t('activityHeatmap')}
              </h3>
              <p className="mt-0.5 truncate text-xs text-gray-500 sm:text-sm dark:text-gray-400">
                {t('attemptsInPeriod', { count: totalAttemptsInPeriod })}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
            {currentStreak !== undefined && currentStreak > 0 && (
              <span className="hidden h-5.5 items-center gap-1.5 rounded-full border border-orange-500/20 bg-orange-500/10 px-2 py-0.5 text-[10px] font-bold tracking-wide text-orange-600 sm:inline-flex sm:h-auto sm:px-2.5 sm:py-1 sm:text-[11px] dark:bg-orange-500/20 dark:text-orange-400">
                <Flame className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                <span className="xs:inline hidden">
                  {currentStreak}{' '}
                  {currentStreak === 1
                    ? tProfile('dayStreak', { fallback: 'Day Streak' })
                    : tProfile('daysStreak', { fallback: 'Days Streak' })}
                </span>
                <span className="xs:hidden">{currentStreak}</span>
              </span>
            )}

            <div className="relative z-20" ref={dropdownRef}>
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="group flex items-center gap-1.5 rounded-full border border-gray-200 bg-white/60 px-3 py-1.5 text-xs font-medium text-gray-600 backdrop-blur-sm transition-all outline-none hover:border-(--accent-primary)/30 hover:bg-white hover:text-(--accent-primary) focus:ring-2 focus:ring-(--accent-primary)/40 dark:border-white/10 dark:bg-neutral-900/50 dark:text-gray-300 dark:hover:bg-neutral-800 dark:hover:text-(--accent-primary)"
                aria-expanded={isDropdownOpen}
                aria-haspopup="listbox"
              >
                <span className="hidden min-w-17.5 text-center sm:block">
                  {periodOptions.find(o => o.value === periodOffset)?.label}
                </span>
                <motion.span
                  animate={{ rotate: isDropdownOpen ? 180 : 0 }}
                  transition={{ duration: 0.2, ease: 'easeInOut' }}
                  className="flex"
                >
                  <ChevronDown className="h-3.5 w-3.5 text-gray-400 transition-colors group-hover:text-(--accent-primary)" />
                </motion.span>
              </button>

              <AnimatePresence>
                {isDropdownOpen && (
                  <motion.div
                    role="listbox"
                    initial={{ opacity: 0, scale: 0.95, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -4 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className="absolute top-full right-0 mt-2 w-44 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xl shadow-black/10 dark:border-neutral-700/60 dark:bg-neutral-900 dark:shadow-black/40"
                  >
                    <div className="flex flex-col gap-0.5 p-1.5">
                      {periodOptions.map(option => {
                        const isSelected = periodOffset === option.value;
                        return (
                          <button
                            key={option.value}
                            role="option"
                            aria-selected={isSelected}
                            onClick={() => {
                              setPeriodOffset(option.value);
                              setIsDropdownOpen(false);
                            }}
                            className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition-all ${
                              isSelected
                                ? 'bg-(--accent-primary)/10 text-(--accent-primary) dark:bg-(--accent-primary)/20'
                                : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-neutral-800/70'
                            }`}
                          >
                            <span>{option.label}</span>
                            {isSelected && (
                              <svg
                                className="h-3.5 w-3.5 shrink-0"
                                viewBox="0 0 14 14"
                                fill="none"
                              >
                                <path
                                  d="M2.5 7L5.5 10L11.5 4"
                                  stroke="currentColor"
                                  strokeWidth="1.75"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        <div className="relative -mb-2 flex w-full flex-1 flex-col justify-center">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 flex w-11 flex-col justify-center pb-1">
            <svg width={44} height={svgHeight} className="block">
              {monthsData.map((m, i) => (
                <text
                  key={`l-${i}`}
                  x="32"
                  y={16 + i * 34 + 3}
                  fontSize="9"
                  textAnchor="end"
                  className="fill-gray-400 font-bold tracking-widest uppercase dark:fill-gray-500"
                >
                  {m.monthStr}
                </text>
              ))}
            </svg>
          </div>

          <div
            className="flex w-full"
            style={{
              WebkitMaskImage:
                'linear-gradient(to right, transparent 0, transparent 20px, black 38px, black 100%)',
              maskImage:
                'linear-gradient(to right, transparent 0, transparent 20px, black 38px, black 100%)',
            }}
          >
            <div
              ref={scrollContainerRef}
              className="scrollbar-hide flex w-full flex-col justify-center overflow-auto"
            >
              <div className="w-full min-w-max pb-1">
                <svg
                  width={svgWidth}
                  height={svgHeight}
                  viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                  className="block"
                >
                  <defs>
                    <filter
                      id="neonGlow"
                      x="-50%"
                      y="-50%"
                      width="200%"
                      height="200%"
                    >
                      <feGaussianBlur stdDeviation="3" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>

                  {monthsData.map((m, i) => (
                    <line
                      key={`bg-${i}`}
                      x1="40"
                      y1={16 + i * 34}
                      x2={svgWidth - 10}
                      y2={16 + i * 34}
                      stroke="currentColor"
                      strokeWidth="1"
                      className="text-gray-100 dark:text-neutral-800/50"
                    />
                  ))}
                  {traces.map((tr, i) => (
                    <motion.path
                      key={`tr-${periodDays}-${i}`}
                      d={getTracePath(tr.x1, tr.y1, tr.x2, tr.y2)}
                      fill="none"
                      stroke={
                        tr.isStreak ? '#f97316' : getCircuitColor(tr.count)
                      }
                      strokeOpacity={
                        tr.isStreak ? 1 : getCircuitOpacity(tr.count)
                      }
                      strokeWidth={tr.isStreak ? '3' : '2'}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      filter={getCircuitGlow(tr.count)}
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: 1, opacity: 1 }}
                      transition={{
                        duration: 0.6,
                        delay: i * 0.015,
                        ease: 'easeOut',
                      }}
                    />
                  ))}

                  {nodes.map((n, i) => {
                    const active = n.count > 0;
                    return (
                      <motion.circle
                        key={`n-${periodDays}-${i}`}
                        cx={n.x}
                        cy={n.y}
                        r={active ? 3.5 : 2.5}
                        fill={
                          active
                            ? n.isPartOfStreak
                              ? '#f97316'
                              : getCircuitColor(n.count)
                            : 'currentColor'
                        }
                        fillOpacity={
                          active
                            ? n.isPartOfStreak
                              ? 1
                              : getCircuitOpacity(n.count)
                            : undefined
                        }
                        className={
                          active
                            ? 'cursor-pointer'
                            : 'cursor-pointer text-gray-200 dark:text-neutral-800'
                        }
                        filter={getCircuitGlow(n.count)}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{
                          type: 'spring',
                          stiffness: 300,
                          damping: 20,
                          delay: i * 0.005,
                        }}
                        onMouseEnter={e => {
                          const rect = (
                            e.currentTarget as Element
                          ).getBoundingClientRect();
                          setTooltip({
                            count: n.count,
                            date: n.date,
                            top: rect.top - 8,
                            left: rect.left + rect.width / 2,
                          });
                        }}
                        onMouseLeave={() => setTooltip(null)}
                      />
                    );
                  })}

                  {nodes
                    .filter(n => n.isToday)
                    .map(n => (
                      <circle
                        key="today"
                        cx={n.x}
                        cy={n.y}
                        r={7}
                        fill="none"
                        stroke="var(--accent-primary)"
                        strokeOpacity={0.8}
                        strokeWidth="1.5"
                        strokeDasharray="2 3"
                        className="animate-[spin_4s_linear_infinite]"
                        style={{ transformOrigin: `${n.x}px ${n.y}px` }}
                      />
                    ))}
                </svg>
              </div>
            </div>
          </div>
        </div>

        <AnimatePresence>
          {tooltip && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 4 }}
              transition={{ duration: 0.1 }}
              className="pointer-events-none fixed z-9999"
              style={{
                top: tooltip.top,
                left: tooltip.left,
                transform: 'translate(-50%, -100%)',
              }}
            >
              <div className="min-w-27.5 rounded-xl bg-gray-900 px-3 py-2 text-center shadow-xl shadow-black/30 dark:bg-white">
                <p className="text-[11px] font-semibold text-white dark:text-gray-900">
                  {tooltip.date.toLocaleDateString(locale, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                </p>
                <p
                  className={`mt-0.5 text-xs font-bold ${
                    tooltip.count === 0
                      ? 'text-gray-500 dark:text-gray-400'
                      : 'text-(--accent-primary)'
                  }`}
                >
                  {tooltip.count === 0
                    ? 'No activity'
                    : `${tooltip.count} ${tooltip.count === 1 ? 'attempt' : 'attempts'}`}
                </p>
                <div className="absolute top-full left-1/2 h-2 w-2 -translate-x-1/2 overflow-hidden">
                  <div className="h-2 w-2 -translate-y-1 rotate-45 bg-gray-900 dark:bg-white" />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="-mt-2 flex w-full flex-row items-center justify-between gap-3 text-xs text-gray-400">
          <div className="flex items-center gap-2">
            <span>{t('less')}</span>
            <div className="flex gap-2">
              {[
                { count: 1, label: '1' },
                { count: 2, label: '2' },
                { count: 3, label: '3+' },
              ].map(l => (
                <svg
                  key={l.count}
                  width="16"
                  height="16"
                  className="overflow-visible"
                >
                  <circle
                    cx="8"
                    cy="8"
                    r="4"
                    fill={getCircuitColor(l.count)}
                    fillOpacity={getCircuitOpacity(l.count)}
                    filter={getCircuitGlow(l.count)}
                  />
                </svg>
              ))}
            </div>
            <span>{t('more')}</span>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-gray-400 dark:text-gray-500">
            {totalActiveDays > 0 && (
              <span className="flex items-center gap-1">
                <CalendarDays className="h-3 w-3" />
                <span>
                  {totalActiveDays} active day{totalActiveDays !== 1 ? 's' : ''}
                </span>
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
