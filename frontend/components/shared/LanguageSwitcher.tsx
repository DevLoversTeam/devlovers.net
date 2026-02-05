'use client';

import { Globe } from 'lucide-react';
import { useParams, usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { type Locale, locales } from '@/i18n/config';
import { Link } from '@/i18n/routing';

const localeLabels: Record<Locale, string> = {
  uk: 'UA',
  en: 'EN',
  pl: 'PL',
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
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="group text-muted-foreground flex items-center gap-1.5 font-medium transition-colors active:text-(--accent-hover)"
        aria-label="Change language"
      >
        <Globe className="h-4 w-4 transition-colors group-hover:text-(--accent-hover) group-active:text-(--accent-hover)" />
        <span className="transition-colors group-hover:text-(--accent-hover) group-active:text-(--accent-hover)">
          {localeLabels[currentLocale]}
        </span>
        <svg
          className={`h-4 w-4 transition-all group-hover:text-(--accent-hover) group-active:text-(--accent-hover) ${
            isOpen ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 w-20 rounded-md border border-gray-200 bg-white py-2 shadow-lg dark:border-neutral-800 dark:bg-neutral-900">
          {locales.map(locale => (
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
              className={`block px-4 py-2 text-sm transition active:text-(--accent-hover) ${
                currentLocale === locale
                  ? 'text-muted-foreground bg-(--accent-primary)/10 font-medium'
                  : 'text-muted-foreground hover:bg-secondary active:bg-secondary'
              }`}
            >
              {localeLabels[locale]}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
