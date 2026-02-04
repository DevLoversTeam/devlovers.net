'use client';

import { Github, Linkedin, Send } from 'lucide-react';
import { useSelectedLayoutSegments } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';

const SOCIAL = [
  { label: 'GitHub', href: 'https://github.com/DevLoversTeam', Icon: Github },
  {
    label: 'LinkedIn',
    href: 'https://www.linkedin.com/company/devlovers',
    Icon: Linkedin,
  },
  { label: 'Telegram', href: 'https://t.me/devloversteam', Icon: Send },
] as const;

export default function Footer({
  footerRef,
}: {
  footerRef?: React.RefObject<HTMLElement>;
}) {
  const t = useTranslations('footer');
  const segments = useSelectedLayoutSegments();
  const isShop = segments.includes('shop');
  return (
    <footer
      ref={footerRef}
      className={cn(
        'border-border bg-background/90 supports-[backdrop-filter]:bg-background/50 relative overflow-hidden border-t backdrop-blur ' +
          '[--footer-brand:var(--accent-primary)] [--footer-hover:var(--accent-hover)] [--theme-toggle-hover:var(--footer-hover)]',
        isShop &&
          '[--footer-brand:var(--foreground)] [--footer-hover:var(--foreground)] ' +
            'dark:[--footer-brand:var(--accent-primary)] dark:[--footer-hover:var(--accent-hover)]'
      )}
    >
      <div className="container-main relative py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-3">
            <p className="text-sm text-slate-700 dark:text-slate-200">
              {t('builtWith')}{' '}
              <span className="font-semibold text-[color:var(--footer-brand)]">
                DevLovers
              </span>{' '}
              {t('byCommunity')}
            </p>

            <p className="text-sm text-slate-500 dark:text-slate-400">
              <Link
                href="/privacy-policy"
                className="transition-colors hover:[color:var(--footer-hover)] focus-visible:[color:var(--footer-hover)] active:[color:var(--footer-hover)]"
              >
                {t('privacyPolicy')}
              </Link>
              <span className="px-2 opacity-60">|</span>
              <Link
                href="/terms-of-service"
                className="transition-colors hover:[color:var(--footer-hover)] focus-visible:[color:var(--footer-hover)] active:[color:var(--footer-hover)]"
              >
                {t('termsOfService')}
              </Link>
            </p>
          </div>

          <div className="flex items-center gap-3 sm:justify-end">
            <div className="inline-flex items-center gap-2">
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
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200/60 bg-white/40 text-slate-600 transition-all hover:-translate-y-0.5 hover:!border-[var(--footer-hover)] hover:!text-[var(--footer-hover)] active:scale-95 active:!border-[var(--footer-hover)] active:!text-[var(--footer-hover)] dark:border-neutral-800/60 dark:bg-neutral-950/30 dark:text-slate-300"
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
