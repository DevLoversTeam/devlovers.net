'use client';

import { Link } from '@/i18n/routing';

import { Github, Linkedin, Send } from 'lucide-react';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { useTranslations } from 'next-intl';

const SOCIAL = [
  { label: 'GitHub', href: 'https://github.com/DevLoversTeam', Icon: Github },
  {
    label: 'LinkedIn',
    href: 'https://www.linkedin.com/company/devlovers',
    Icon: Linkedin,
  },
  { label: 'Telegram', href: 'https://t.me/devloversteam', Icon: Send },
] as const;

export default function Footer() {
  const t = useTranslations('footer');

  return (
    <footer className="relative overflow-hidden border-t border-gray-200/70 dark:border-neutral-800/70">
      <div
        className="
    absolute inset-0
    bg-white
    dark:bg-neutral-950/70
    dark:backdrop-blur
  "
      />

      <div
        aria-hidden="true"
        className="
    pointer-events-none absolute inset-0
    hidden dark:block
    opacity-40
    [background-image:radial-gradient(circle_at_20%_30%,rgba(59,130,246,0.20)_0,transparent_35%),radial-gradient(circle_at_80%_20%,rgba(168,85,247,0.18)_0,transparent_38%),radial-gradient(circle,rgba(148,163,184,0.18)_1px,transparent_1px)]
    [background-size:900px_420px,900px_420px,22px_22px]
  "
      />

      <div className="relative mx-auto max-w-5xl px-6 py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-3">
            <p className="text-sm text-slate-700 dark:text-slate-200">
              {t('builtWith')}{' '}
              <span
                className="font-semibold "
                style={{ color: 'var(--accent-primary)' }}
              >
                DevLovers
              </span>{' '}
              {t('byCommunity')}
            </p>

            <p className="text-sm text-slate-500 dark:text-slate-400">
              <Link
                href="/privacy-policy"
                className="transition-colors hover:[color:var(--accent-hover)] focus-visible:[color:var(--accent-hover)]"
              >
                {t('privacyPolicy')}
              </Link>
              <span className="px-2 opacity-60">|</span>
              <Link
                href="/terms-of-service"
                className="transition-colors hover:[color:var(--accent-hover)] focus-visible:[color:var(--accent-hover)]"
              >
                {t('termsOfService')}
              </Link>
            </p>
          </div>

          <div className="flex items-center gap-3 sm:justify-end">
            <div
              className="
                inline-flex items-center gap-2

              "
            >
              <ThemeToggle />

              <span className="mx-1 h-5 w-px bg-gray-200/70 dark:bg-neutral-800/70" />

              <div className="flex items-center gap-2">
                {SOCIAL.map(({ href, label, Icon }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={label}
                    className="
                      inline-flex h-9 w-9 items-center justify-center
                      rounded-full border border-gray-200/60
                      bg-white/40
                      text-slate-600
                      transition-all
                      hover:-translate-y-0.5
                      dark:border-neutral-800/60
                      dark:bg-neutral-950/30
                      dark:text-slate-300
                      [&:hover]:!text-[var(--accent-primary)]
                      [&:hover]:!border-[var(--accent-primary)]
                    "
                  >
                    <Icon className="h-5 w-5" />
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-gray-200/60 pt-4 text-xs text-slate-500 dark:border-neutral-800/60 dark:text-slate-400">
          <p>© {new Date().getFullYear()} DevLovers</p>
        </div>
      </div>
    </footer>
  );
}
