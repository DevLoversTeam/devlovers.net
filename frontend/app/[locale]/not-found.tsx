'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';

export default function NotFound() {
  const t = useTranslations('notFound');

  return (
    <main className="relative min-h-[calc(100vh-200px)] flex items-center justify-center overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none -z-10"
        aria-hidden="true"
      >
        <div className="absolute inset-0 bg-gradient-to-b from-sky-50 via-white to-rose-50 dark:from-slate-950 dark:via-slate-950 dark:to-black" />
        <div className="absolute top-1/4 left-1/4 h-96 w-[36rem] -translate-x-1/2 rounded-full bg-sky-300/20 blur-3xl dark:bg-sky-500/10" />
        <div className="absolute bottom-1/4 right-1/4 h-[26rem] w-[26rem] rounded-full bg-violet-300/30 blur-3xl dark:bg-violet-500/10" />
      </div>

      <div className="relative z-10 text-center px-6 py-12">
        <p className="text-8xl md:text-9xl font-black bg-gradient-to-r from-sky-400 via-violet-400 to-pink-400 dark:from-sky-400 dark:via-indigo-400 dark:to-fuchsia-500 bg-clip-text text-transparent">
          404
        </p>

        <h1 className="mt-6 text-2xl md:text-3xl font-bold text-slate-900 dark:text-white">
          {t('title')}
        </h1>

        <p className="mt-4 max-w-md mx-auto text-slate-600 dark:text-slate-400">
          {t('description')}
        </p>

        <Link
          href="/"
          className="mt-8 inline-flex items-center justify-center rounded-full bg-gradient-to-r from-sky-500 to-violet-500 px-6 py-3 text-sm font-medium text-white transition-all hover:from-sky-600 hover:to-violet-600 hover:shadow-lg hover:shadow-sky-500/25"
        >
          {t('backHome')}
        </Link>
      </div>
    </main>
  );
}
