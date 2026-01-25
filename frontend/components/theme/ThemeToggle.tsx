'use client';

import { useTheme } from 'next-themes';
import { Monitor, Sun, Moon } from 'lucide-react';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const themes = [
  { value: 'system', icon: Monitor, label: 'System theme' },
  { value: 'light', icon: Sun, label: 'Light theme' },
  { value: 'dark', icon: Moon, label: 'Dark theme' },
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
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
      {themes.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          aria-label={label}
          className="theme-toggle-btn relative flex h-7 w-7 items-center justify-center rounded-full"
        >
          {theme === value && (
            <motion.div
              layoutId="theme-active"
              className="absolute inset-0 rounded-full bg-white shadow-sm dark:bg-neutral-800"
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          )}
          <Icon className="relative z-10 h-4 w-4 text-neutral-500 dark:text-neutral-400 transition-colors" />
        </button>
      ))}

      <style jsx>{`
        .theme-toggle-btn:hover :global(svg),
        .theme-toggle-btn:focus-visible :global(svg),
        .theme-toggle-btn:active :global(svg) {
          color: var(--accent-hover);
        }
      `}</style>
    </div>
  );
}
