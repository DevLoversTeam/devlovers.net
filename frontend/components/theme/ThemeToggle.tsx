'use client';

import { motion } from 'framer-motion';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

const themes = [
  { value: 'system', icon: Monitor, labelKey: 'themeSystem' },
  { value: 'light', icon: Sun, labelKey: 'themeLight' },
  { value: 'dark', icon: Moon, labelKey: 'themeDark' },
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const t = useTranslations('aria');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex h-9 items-center gap-1 rounded-full bg-neutral-100 p-1 dark:border dark:border-neutral-800 dark:bg-neutral-950">
        {themes.map(({ value, icon: Icon }) => (
          <div
            key={value}
            className="relative flex h-7 w-7 items-center justify-center rounded-full"
          >
            <Icon className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-9 items-center gap-1 rounded-full bg-neutral-100 p-1 dark:border dark:border-neutral-800 dark:bg-neutral-950">
      {themes.map(({ value, icon: Icon, labelKey }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          aria-label={t(labelKey)}
          className="theme-toggle-btn relative flex h-7 w-7 items-center justify-center rounded-full"
        >
          {theme === value && (
            <motion.div
              layoutId="theme-active"
              className="absolute inset-0 rounded-full bg-white shadow-sm dark:bg-neutral-800"
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          )}
          <Icon className="relative z-10 h-4 w-4 text-neutral-500 transition-colors dark:text-neutral-400" />
        </button>
      ))}

      <style jsx>{`
        .theme-toggle-btn:hover :global(svg),
        .theme-toggle-btn:focus-visible :global(svg),
        .theme-toggle-btn:active :global(svg) {
          color: var(--theme-toggle-hover, var(--accent-hover));
        }
      `}</style>
    </div>
  );
}
