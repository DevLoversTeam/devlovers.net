'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';

export function CookieBanner() {
  const t = useTranslations('CookieBanner');
  const [isVisible, setIsVisible] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const consent = localStorage.getItem('cookie-consent');
    if (!consent) {
      const timer = setTimeout(() => setIsVisible(true), 500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem('cookie-consent', 'accepted');
    setIsVisible(false);
  };

  const handleDecline = () => {
    localStorage.setItem('cookie-consent', 'declined');
    setIsVisible(false);
  };

  if (!isMounted || !isVisible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] p-4 md:p-6 animate-in slide-in-from-bottom-full fade-in duration-700">
      <div className="mx-auto max-w-4xl rounded-2xl border border-gray-200 bg-white/90 p-5 shadow-2xl backdrop-blur-md dark:border-gray-800 dark:bg-gray-900/90 md:flex md:items-center md:justify-between md:gap-6">
        <div className="mb-4 md:mb-0 md:flex-1">
          <h3 className="mb-1 text-lg font-semibold text-gray-900 dark:text-white">
            {t('title')}
          </h3>
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
            onClick={handleDecline}
            className="w-full sm:w-auto"
          >
            {t('decline')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleAccept}
            className="w-full sm:w-auto shadow-lg shadow-blue-500/20"
          >
            {t('accept')}
          </Button>
        </div>

        <button
          onClick={handleDecline}
          className="absolute right-2 top-2 rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300 md:hidden"
          aria-label={t('decline')}
        >
          <X size={20} />
        </button>
      </div>
    </div>
  );
}
