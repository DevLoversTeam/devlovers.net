'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Users, Sparkles } from 'lucide-react';

export function OnlineCounterPopup() {
  const t = useTranslations('onlineCounter');
  const [online, setOnline] = useState<number | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem('shown')) return;

    fetch('/api/sessions/activity', { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        setOnline(data.online);
        setTimeout(() => setShow(true), 500);
        sessionStorage.setItem('shown', '1');
        setTimeout(() => setShow(false), 10000);
      })
      .catch(() => setOnline(null));
  }, []);

  if (!online) return null;

  const getEmoji = (count: number) => {
    if (count === 1) return '🎯';
    if (count === 2) return '💼';
    if (count <= 5) return '🚀';
    if (count <= 10) return '⚡';
    return '⭐';
  };

  const getText = (count: number) => {
    if (count === 1) return t('one');
    if (count === 2) return t('two');
    if (count <= 5) return t('upToFive');
    if (count <= 10) return t('upToTen');
    return t('many');
  };

  return (
    <div className="fixed bottom-12 right-12 z-50 max-w-md">
      <div
        className={`
          transition-all duration-500 ease-out
          ${
            show
              ? 'translate-y-0 opacity-100 scale-100'
              : 'translate-y-4 opacity-0 scale-90'
          }
        `}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-blue-400/20 via-purple-400/20 to-pink-400/20 dark:from-blue-500/30 dark:via-purple-500/30 dark:to-pink-500/30 blur-2xl animate-pulse" />

        <div className="relative inline-flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 dark:from-blue-600 dark:via-purple-600 dark:to-pink-600 shadow-2xl">
          <div className="relative flex-shrink-0">
            <div className="w-10 h-10 rounded-xl bg-white/30 dark:bg-white/25 backdrop-blur-sm flex items-center justify-center">
              <Users className="w-5 h-5 text-white" />
            </div>
            <Sparkles
              className="absolute -top-1 -right-1 w-4 h-4 text-yellow-300 dark:text-yellow-200 animate-spin"
              style={{ animationDuration: '3s' }}
            />
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-xl">{getEmoji(online)}</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-white dark:text-yellow-100 drop-shadow-sm">
                {online}
              </span>
              <span className="text-base font-semibold text-white/95 dark:text-white/90 whitespace-nowrap">
                {getText(online)}
              </span>
            </div>
          </div>

          <div className="ml-1 flex-shrink-0">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-300 dark:bg-purple-200 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-purple-400 dark:bg-purple-300" />
            </span>
          </div>

          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/25 dark:bg-white/20 rounded-b-2xl overflow-hidden">
            <div
              className="h-full bg-white/60 dark:bg-white/50"
              style={{ animation: 'shrink 8s linear forwards' }}
            />
          </div>
        </div>

        <div className="absolute -top-1 left-6 w-1.5 h-1.5 rounded-full bg-blue-400/60 dark:bg-blue-300/70 animate-ping" />
        <div
          className="absolute -top-2 right-8 w-1 h-1 rounded-full bg-purple-400/60 dark:bg-purple-300/70 animate-ping"
          style={{ animationDelay: '0.5s' }}
        />
      </div>
    </div>
  );
}
