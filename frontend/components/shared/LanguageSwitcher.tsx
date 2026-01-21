'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams, usePathname,useSearchParams } from 'next/navigation';
import { locales, type Locale } from '@/i18n/config';
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
        className="flex items-center gap-1 text-gray-700 dark:text-gray-300 font-medium hover:text-blue-600 dark:hover:text-blue-400 transition"
      >
        {localeLabels[currentLocale]}
        <svg
          className={`h-4 w-4 transition-transform ${
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
        <div className="absolute right-0 mt-2 py-2 w-20 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-md shadow-lg z-50">
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
              className={`block px-4 py-2 text-sm transition ${
                currentLocale === locale
                  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-neutral-800'
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
