'use client';

import { Check, Globe } from 'lucide-react';
import { useParams, usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { type Locale, locales } from '@/i18n/config';
import { Link } from '@/i18n/routing';

const localeLabels: Record<Locale, string> = {
  en: 'English',
  uk: 'Українська',
  pl: 'Polski',
};

export default function LanguageSwitcher() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const fullPathname = usePathname();
  const params = useParams();
  const currentLocale = params.locale as Locale;
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();

  const pathname = fullPathname.replace(/^\/(uk|en|pl)/, '') || '/';
  const allowRestoreKey = 'quiz-allow-restore';
  const isQuizPage = pathname.startsWith('/quiz/');

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative flex items-center" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="text-muted-foreground hover:bg-secondary active:bg-secondary flex h-9 w-9 items-center justify-center rounded-full border border-transparent transition-colors hover:border-gray-200 dark:hover:border-neutral-800"
        aria-label="Change language"
      >
        <Globe className="h-4 w-4" />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 z-70 mt-3 w-48 rounded-2xl border border-gray-200/50 bg-white/95 p-2 shadow-lg backdrop-blur-3xl dark:border-white/10 dark:bg-neutral-900/95">
          <div className="mb-2 border-b border-gray-100/50 px-2 pb-2 dark:border-white/10">
            <p className="text-sm font-semibold tracking-wide text-gray-900 dark:text-white">Language</p>
          </div>
          <div className="flex flex-col gap-1">
            {locales.map(locale => {
              const isActive = currentLocale === locale;
              return (
                <Link
                  key={locale}
                  href={`${pathname}${queryString ? `?${queryString}` : ''}`}
                  locale={locale}
                  onClick={() => {
                    if (isQuizPage) {
                      sessionStorage.setItem(allowRestoreKey, '1');
                    }
                    setIsOpen(false);
                  }}
                  className={`flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? 'bg-(--accent-primary)/10 text-(--accent-primary) font-medium'
                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground active:bg-secondary'
                  }`}
                >
                  <span>{localeLabels[locale]}</span>
                  {isActive && <Check className="h-4 w-4" />}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
