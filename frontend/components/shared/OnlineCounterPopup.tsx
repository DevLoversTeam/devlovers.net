'use client';

import { Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

const SHOW_DURATION_MS = 10_000;
const SESSION_KEY = 'onlineCounterShown';

type OnlineCounterPopupProps = {
  ctaRef: React.RefObject<HTMLAnchorElement | null>;
};

export function OnlineCounterPopup({ ctaRef }: OnlineCounterPopupProps) {
  const t = useTranslations('onlineCounter');
  const [online, setOnline] = useState<number | null>(null);
  const [show, setShow] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  const fetchActivity = useCallback(() => {
    fetch('/api/sessions/activity', { method: 'POST' })
      .then(r => {
        if (!r.ok) throw new Error(r.statusText);
        return r.json();
      })
      .then(data => {
        if (typeof data.online === 'number') setOnline(data.online);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const alreadyShown = sessionStorage.getItem(SESSION_KEY);

    fetchActivity();

    if (!alreadyShown) {
      const showTimer = setTimeout(() => setShow(true), 500);
      sessionStorage.setItem(SESSION_KEY, '1');

      hideTimerRef.current = setTimeout(
        () => setShow(false),
        SHOW_DURATION_MS + 500
      );

      return () => {
        clearTimeout(showTimer);
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      };
    }
  }, [fetchActivity]);

  const subscribe = useCallback((cb: () => void) => {
    window.addEventListener('resize', cb);
    return () => window.removeEventListener('resize', cb);
  }, []);

  const isMobile = useSyncExternalStore(
    subscribe,
    () => window.innerWidth < 768,
    () => true
  );

  const top = useSyncExternalStore(
    subscribe,
    () => {
      if (!isMobile || !ctaRef.current) return 0;
      const rect = ctaRef.current.getBoundingClientRect();
      const desired = rect.bottom + rect.height + 14;
      const popupHeight = 56;
      const safeBottom = 16;
      const max = window.innerHeight - popupHeight - safeBottom;
      return Math.min(desired, max);
    },
    () => 0
  );

  if (online === null) return null;

  const getText = (count: number) => {
    if (count === 1) return t('one');
    if (count === 2) return t('two');
    if (count <= 5) return t('upToFive');
    if (count <= 10) return t('upToTen');
    return t('many');
  };

  return (
    <div
      className="fixed right-0 left-0 z-50 flex justify-center md:right-12 md:bottom-[10vh] md:left-auto md:justify-end"
      style={isMobile ? { top } : undefined}
    >
      <div
        className={`transition-all duration-500 ease-out ${
          show
            ? 'translate-y-0 scale-100 opacity-100'
            : 'translate-y-4 scale-90 opacity-0'
        }`}
      >
        <div className="relative">
          <div className="absolute -inset-1.5 rounded-3xl bg-[var(--accent-primary)]/15 blur-xl sm:-inset-2 dark:bg-[var(--accent-primary)]/20" />

          <div className="bg-card/95 relative inline-flex items-center gap-2.5 overflow-hidden rounded-xl border border-[var(--accent-primary)]/20 py-2.5 pr-3.5 pl-3 shadow-2xl backdrop-blur-xl sm:gap-2.5 sm:rounded-xl sm:py-2.5 sm:pr-3.5 sm:pl-3 md:gap-3 md:rounded-2xl md:py-3 md:pr-4 md:pl-3.5">
            <div className="absolute inset-0 opacity-40">
              <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent-primary)]/10 via-[var(--accent-primary)]/5 to-transparent" />
              <div
                className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,var(--accent-primary)_0%,transparent_2%)] opacity-30"
                style={{ backgroundSize: '20px 20px' }}
              />
            </div>

            <div className="relative z-10 flex-shrink-0">
              <div className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg border border-[var(--accent-primary)]/20 bg-[var(--accent-primary)]/10 backdrop-blur-sm sm:h-9 sm:w-9 sm:rounded-lg md:h-10 md:w-10 md:rounded-xl dark:bg-[var(--accent-primary)]/15">
                <div className="absolute inset-0 animate-pulse bg-gradient-to-tr from-[var(--accent-primary)]/20 to-transparent" />
                <Users className="relative z-10 h-4 w-4 text-[var(--accent-primary)] sm:h-4 sm:w-4 md:h-5 md:w-5" />
              </div>
            </div>

            <div className="relative z-10 flex items-baseline gap-1.5 sm:gap-1.5 md:gap-2">
              <div className="flex items-baseline gap-1 sm:gap-1 md:gap-1.5">
                <span className="text-2xl font-black text-[var(--accent-primary)] sm:text-xl md:text-2xl dark:text-[var(--accent-primary)]">
                  {online}
                </span>
                <span className="text-foreground/80 dark:text-foreground/90 text-xs font-semibold whitespace-nowrap sm:text-xs md:text-sm">
                  {getText(online)}
                </span>
              </div>
            </div>

            <div className="relative z-10 ml-auto flex-shrink-0">
              <span className="relative flex h-2.5 w-2.5 sm:h-2.5 sm:w-2.5 md:h-3 md:w-3">
                <span
                  className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent-primary)]/60"
                  style={{ animationDuration: '1.5s' }}
                />
                <span
                  className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent-primary)]/40"
                  style={{ animationDuration: '2s', animationDelay: '0.5s' }}
                />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--accent-primary)] shadow-[var(--accent-primary)]/50 shadow-lg sm:h-2.5 sm:w-2.5 md:h-3 md:w-3" />
              </span>
            </div>

            <div className="absolute right-0 bottom-0 left-0 h-0.5 overflow-hidden rounded-b-xl bg-[var(--accent-primary)]/10 sm:h-0.5 sm:rounded-b-xl md:h-1 md:rounded-b-2xl">
              <div
                className="h-full bg-gradient-to-r from-[var(--accent-primary)]/30 via-[var(--accent-primary)]/50 to-[var(--accent-primary)]/30"
                style={{ animation: 'shrink 8s linear forwards' }}
              />
            </div>

            <div className="absolute top-0 right-0 left-0 h-px bg-gradient-to-r from-transparent via-[var(--accent-primary)]/30 to-transparent" />
            <div className="absolute top-1/4 bottom-1/4 left-0 w-px bg-gradient-to-b from-transparent via-[var(--accent-primary)]/20 to-transparent" />
            <div className="absolute top-1/4 right-0 bottom-1/4 w-px bg-gradient-to-b from-transparent via-[var(--accent-primary)]/20 to-transparent" />
          </div>

          <div className="absolute -top-1 left-4 h-1 w-1 animate-ping rounded-full bg-[var(--accent-primary)]/60 sm:left-6 sm:h-1.5 sm:w-1.5 dark:bg-[var(--accent-primary)]/70" />
          <div
            className="absolute -top-2 right-6 h-0.5 w-0.5 animate-ping rounded-full bg-[var(--accent-primary)]/60 sm:right-8 sm:h-1 sm:w-1 dark:bg-[var(--accent-primary)]/70"
            style={{ animationDelay: '0.5s' }}
          />
          <div
            className="absolute -top-1.5 left-1/3 h-1 w-1 animate-ping rounded-full bg-[var(--accent-primary)]/50 dark:bg-[var(--accent-primary)]/60"
            style={{ animationDelay: '1s' }}
          />
          <div
            className="absolute top-1/4 -left-1 h-1 w-1 animate-ping rounded-full bg-[var(--accent-primary)]/40 dark:bg-[var(--accent-primary)]/50"
            style={{ animationDelay: '1.5s' }}
          />
          <div
            className="absolute top-2/3 -right-1 h-1 w-1 animate-ping rounded-full bg-[var(--accent-primary)]/40 dark:bg-[var(--accent-primary)]/50"
            style={{ animationDelay: '2s' }}
          />
          <div
            className="absolute -bottom-1 left-1/4 h-0.5 w-0.5 animate-ping rounded-full bg-[var(--accent-primary)]/50 sm:h-1 sm:w-1 dark:bg-[var(--accent-primary)]/60"
            style={{ animationDelay: '0.8s' }}
          />
          <div
            className="absolute right-1/3 -bottom-1.5 h-1 w-1 animate-ping rounded-full bg-[var(--accent-primary)]/50 dark:bg-[var(--accent-primary)]/60"
            style={{ animationDelay: '1.2s' }}
          />
        </div>
      </div>
    </div>
  );
}
