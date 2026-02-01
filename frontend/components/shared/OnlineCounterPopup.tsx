'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Users } from 'lucide-react';

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

  const getText = (count: number) => {
    if (count === 1) return t('one');
    if (count === 2) return t('two');
    if (count <= 5) return t('upToFive');
    if (count <= 10) return t('upToTen');
    return t('many');
  };

  return (
    <div className="fixed bottom-[30vh] left-0 right-0 md:bottom-[10vh] md:left-auto md:right-12 z-50 flex justify-center md:justify-end md:pr-0">
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
        <div className="relative">
          <div className="absolute -inset-1.5 sm:-inset-2 bg-[var(--accent-primary)]/15 dark:bg-[var(--accent-primary)]/20 blur-xl rounded-3xl" />

          <div className="relative inline-flex items-center gap-2.5 sm:gap-2.5 md:gap-3 pl-3 sm:pl-3 md:pl-3.5 pr-3.5 sm:pr-3.5 md:pr-4 py-2.5 sm:py-2.5 md:py-3 rounded-xl sm:rounded-xl md:rounded-2xl bg-card/95 backdrop-blur-xl border border-[var(--accent-primary)]/20 shadow-2xl overflow-hidden">
            <div className="absolute inset-0 opacity-40">
              <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent-primary)]/10 via-[var(--accent-primary)]/5 to-transparent" />
              <div
                className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,var(--accent-primary)_0%,transparent_2%)] opacity-30"
                style={{ backgroundSize: '20px 20px' }}
              />
            </div>

            <div className="relative flex-shrink-0 z-10">
              <div className="w-9 h-9 sm:w-9 sm:h-9 md:w-10 md:h-10 rounded-lg sm:rounded-lg md:rounded-xl bg-[var(--accent-primary)]/10 dark:bg-[var(--accent-primary)]/15 backdrop-blur-sm flex items-center justify-center border border-[var(--accent-primary)]/20 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-tr from-[var(--accent-primary)]/20 to-transparent animate-pulse" />
                <Users className="w-4 h-4 sm:w-4 sm:h-4 md:w-5 md:h-5 text-[var(--accent-primary)] relative z-10" />
              </div>
            </div>

            <div className="flex items-baseline gap-1.5 sm:gap-1.5 md:gap-2 relative z-10">
              <div className="flex items-baseline gap-1 sm:gap-1 md:gap-1.5">
                <span className="text-2xl sm:text-xl md:text-2xl font-black text-[var(--accent-primary)] dark:text-[var(--accent-primary)]">
                  {online}
                </span>
                <span className="text-xs sm:text-xs md:text-sm font-semibold text-foreground/80 dark:text-foreground/90 whitespace-nowrap">
                  {getText(online)}
                </span>
              </div>
            </div>

            <div className="ml-auto flex-shrink-0 relative z-10">
              <span className="relative flex h-2.5 w-2.5 sm:h-2.5 sm:w-2.5 md:h-3 md:w-3">
                <span
                  className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent-primary)]/60"
                  style={{ animationDuration: '1.5s' }}
                />
                <span
                  className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent-primary)]/40"
                  style={{ animationDuration: '2s', animationDelay: '0.5s' }}
                />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 sm:h-2.5 sm:w-2.5 md:h-3 md:w-3 bg-[var(--accent-primary)] shadow-lg shadow-[var(--accent-primary)]/50" />
              </span>
            </div>

            <div className="absolute bottom-0 left-0 right-0 h-0.5 sm:h-0.5 md:h-1 bg-[var(--accent-primary)]/10 rounded-b-xl sm:rounded-b-xl md:rounded-b-2xl overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[var(--accent-primary)]/30 via-[var(--accent-primary)]/50 to-[var(--accent-primary)]/30"
                style={{ animation: 'shrink 8s linear forwards' }}
              />
            </div>

            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--accent-primary)]/30 to-transparent" />

            <div className="absolute left-0 top-1/4 bottom-1/4 w-px bg-gradient-to-b from-transparent via-[var(--accent-primary)]/20 to-transparent" />
            <div className="absolute right-0 top-1/4 bottom-1/4 w-px bg-gradient-to-b from-transparent via-[var(--accent-primary)]/20 to-transparent" />
          </div>

          <div className="absolute -top-1 left-4 sm:left-6 w-1 sm:w-1.5 h-1 sm:h-1.5 rounded-full bg-[var(--accent-primary)]/60 dark:bg-[var(--accent-primary)]/70 animate-ping" />
          <div
            className="absolute -top-2 right-6 sm:right-8 w-0.5 sm:w-1 h-0.5 sm:h-1 rounded-full bg-[var(--accent-primary)]/60 dark:bg-[var(--accent-primary)]/70 animate-ping"
            style={{ animationDelay: '0.5s' }}
          />
          <div
            className="absolute -top-1.5 left-1/3 w-1 h-1 rounded-full bg-[var(--accent-primary)]/50 dark:bg-[var(--accent-primary)]/60 animate-ping"
            style={{ animationDelay: '1s' }}
          />

          <div
            className="absolute top-1/4 -left-1 w-1 h-1 rounded-full bg-[var(--accent-primary)]/40 dark:bg-[var(--accent-primary)]/50 animate-ping"
            style={{ animationDelay: '1.5s' }}
          />
          <div
            className="absolute top-2/3 -right-1 w-1 h-1 rounded-full bg-[var(--accent-primary)]/40 dark:bg-[var(--accent-primary)]/50 animate-ping"
            style={{ animationDelay: '2s' }}
          />

          <div
            className="absolute -bottom-1 left-1/4 w-0.5 sm:w-1 h-0.5 sm:h-1 rounded-full bg-[var(--accent-primary)]/50 dark:bg-[var(--accent-primary)]/60 animate-ping"
            style={{ animationDelay: '0.8s' }}
          />
          <div
            className="absolute -bottom-1.5 right-1/3 w-1 h-1 rounded-full bg-[var(--accent-primary)]/50 dark:bg-[var(--accent-primary)]/60 animate-ping"
            style={{ animationDelay: '1.2s' }}
          />
        </div>
      </div>
    </div>
  );
}
