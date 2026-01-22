'use client';

import { useRef } from 'react';
import { motion, useMotionTemplate, useMotionValue } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { LeaderboardPodium } from './LeaderboardPodium';
import { LeaderboardTable } from './LeaderboardTable';
import { User } from './types';

// Імпортуємо тип з auth
type AuthUser = { id: string; username: string; email: string };

interface LeaderboardClientProps {
  initialUsers: User[];
  currentUser?: AuthUser | null;
}

export default function LeaderboardClient({
  initialUsers,
  currentUser,
}: LeaderboardClientProps) {
  const t = useTranslations('leaderboard');

  // Використовуємо всіх користувачів для таблиці
  const allUsers = initialUsers;
  // Подіум тільки для тих, хто має бали
  const topThree = allUsers.filter(u => u.points > 0).slice(0, 3);
  const hasResults = topThree.length > 0;

  // --- Логіка ефекту ліхтарика ---
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  function handleMouseMove({
    currentTarget,
    clientX,
    clientY,
  }: React.MouseEvent) {
    const { left, top } = currentTarget.getBoundingClientRect();
    mouseX.set(clientX - left);
    mouseY.set(clientY - top);
  }

  const maskImage = useMotionTemplate`radial-gradient(500px circle at ${mouseX}px ${mouseY}px, black, transparent)`;

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className="relative min-h-screen overflow-hidden bg-slate-50 dark:bg-slate-950 group transition-colors duration-300"
    >
      {/* Background Layers - КОНТУРНІ СЕРДЕЧКА 💖 */}

      {/* 1. Статичний шар (сірі контури, ледь помітні) */}
      <div
        className="absolute inset-0 z-0 bg-repeat [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"
        style={{
          // stroke='%23808080' - це сірий колір обводки
          // fill='none' - прозорий центр
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='24' height='24' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z' stroke='%23808080' stroke-width='1.5' stroke-opacity='0.15' fill='none'/%3E%3C/svg%3E")`,
          backgroundSize: '40px 40px',
        }}
      />

      {/* 2. Динамічний шар (МАЖЕНТО контури, світяться під мишкою) */}
      <motion.div
        className="absolute inset-0 z-0 bg-repeat"
        style={{
          maskImage,
          WebkitMaskImage: maskImage,
          // stroke='%23ff2d55' - це твій маженто колір обводки
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='24' height='24' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z' stroke='%23ff2d55' stroke-width='2' stroke-opacity='0.5' fill='none'/%3E%3C/svg%3E")`,
          backgroundSize: '40px 40px',
        }}
      />

      {/* Велика розмита пляма по центру */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-[#ff2d55]/15 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative max-w-5xl mx-auto px-4 py-20 flex flex-col items-center z-10">
        <header className="text-center mb-16 animate-in fade-in slide-in-from-top-4 duration-700">
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-[#ff2d55] mb-6 drop-shadow-sm">
            {t('title')}
          </h1>
          <p className="text-slate-600 dark:text-slate-400 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed font-medium">
            {t('subtitle')}
          </p>
        </header>

        <div className="w-full flex flex-col items-center">
          <div className="w-full mb-16">
            {hasResults ? (
              <LeaderboardPodium topThree={topThree} />
            ) : (
              <div className="text-center py-20 rounded-2xl border border-slate-300 dark:border-white/10 bg-white/50 dark:bg-white/5 backdrop-blur-sm shadow-sm">
                <p className="text-6xl mb-4 grayscale opacity-50">🏆</p>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                  {t('noResults')}
                </h2>
                <p className="text-slate-600 dark:text-slate-400">
                  {t('beFirst')}
                </p>
              </div>
            )}
          </div>

          <div className="w-full animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200">
            <LeaderboardTable users={allUsers} currentUser={currentUser} />
          </div>
        </div>
      </div>
    </div>
  );
}
