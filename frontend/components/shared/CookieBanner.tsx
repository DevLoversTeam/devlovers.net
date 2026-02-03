'use client';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/routing';

export function CookieBanner() {
  const t = useTranslations('CookieBanner');
  const [isVisible, setIsVisible] = useState<boolean | null>(null);

  useEffect(() => {
    const consent = localStorage.getItem('cookie-consent');
    if (!consent) {
      const timer = setTimeout(() => setIsVisible(true), 500);
      return () => clearTimeout(timer);
    } else {
      const timer = setTimeout(() => setIsVisible(false), 0);
      return () => clearTimeout(timer);
    }
  }, []);

  if (isVisible === null || !isVisible) return null;

  const handleAction = (type: 'accepted' | 'declined') => {
    try {
      localStorage.setItem('cookie-consent', type);
    } catch (error) {
      console.error('Failed to save cookie consent:', error);
    }
    setIsVisible(false);
  };

  return (
    <div className="animate-in slide-in-from-bottom-full fade-in fixed right-0 bottom-0 left-0 z-[100] p-4 duration-700 md:p-6">
      <div className="mx-auto max-w-4xl rounded-2xl border border-gray-200 bg-white/90 p-5 shadow-2xl backdrop-blur-md md:flex md:items-center md:justify-between md:gap-6 dark:border-gray-800 dark:bg-gray-900/90">
        <div className="mb-4 md:mb-0 md:flex-1">
          <div className="mb-1 text-lg font-semibold text-gray-900 dark:text-white">
            {t('title')}
          </div>
          <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
            {t('description')}{' '}
            <Link
              href="/privacy-policy"
              className="font-medium text-blue-600 underline decoration-blue-600/30 underline-offset-4 transition-colors hover:text-blue-700 hover:decoration-blue-700 dark:text-blue-500 dark:hover:text-blue-400"
            >
              {t('policyLink')}
            </Link>
            .
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleAction('declined')}
            className="w-full sm:w-auto"
          >
            {t('decline')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => handleAction('accepted')}
            className="w-full shadow-lg shadow-blue-500/20 sm:w-auto"
          >
            {t('accept')}
          </Button>
        </div>

        <button
          onClick={() => handleAction('declined')}
          className="absolute top-2 right-2 rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 md:hidden dark:hover:bg-gray-800 dark:hover:text-gray-300"
          aria-label={t('decline')}
        >
          <X size={20} />
        </button>
      </div>
    </div>
  );
}
