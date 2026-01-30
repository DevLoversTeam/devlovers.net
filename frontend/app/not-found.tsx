import { cookies } from 'next/headers';

import ukMessages from '@/messages/uk.json';
import enMessages from '@/messages/en.json';
import plMessages from '@/messages/pl.json';

type Locale = 'uk' | 'en' | 'pl';

const locales: Locale[] = ['uk', 'en', 'pl'];

const messages = {
  uk: ukMessages.notFound,
  en: enMessages.notFound,
  pl: plMessages.notFound,
};

export default async function NotFound() {
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get('NEXT_LOCALE')?.value;
  const locale: Locale =
    localeCookie && locales.includes(localeCookie as Locale)
      ? (localeCookie as Locale)
      : 'en';
  const t = messages[locale];

  return (
    <main className="relative min-h-screen flex items-center justify-center overflow-hidden bg-background transition-colors duration-300">
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute -top-32 left-1/2 h-96 w-[36rem] -translate-x-1/2 rounded-full bg-[var(--accent-primary)]/20 blur-3xl" />
        <div className="absolute bottom-[-12rem] left-1/4 h-[22rem] w-[22rem] rounded-full bg-[var(--accent-hover)]/15 blur-3xl" />
        <div className="absolute bottom-[-10rem] right-0 h-[26rem] w-[26rem] rounded-full bg-[var(--accent-primary)]/25 blur-3xl" />
      </div>

      <div className="pointer-events-none absolute inset-0 opacity-40 dark:opacity-60">
        <span className="absolute left-[10%] top-[18%] h-1 w-1 rounded-full bg-[var(--accent-primary)]" />
        <span className="absolute left-[35%] top-[8%] h-1 w-1 rounded-full bg-[var(--accent-hover)]" />
        <span className="absolute left-[70%] top-[16%] h-1 w-1 rounded-full bg-[var(--accent-primary)]" />
        <span className="absolute left-[80%] top-[40%] h-1 w-1 rounded-full bg-[var(--accent-hover)]" />
        <span className="absolute left-[18%] top-[60%] h-1 w-1 rounded-full bg-[var(--accent-primary)]" />
      </div>

      <div className="relative z-10 text-center px-6 py-12">
        <div className="relative inline-block mt-4">
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-black tracking-tight">
            <span className="relative inline-block bg-gradient-to-r from-[var(--accent-primary)]/70 via-[color-mix(in_srgb,var(--accent-primary)_70%,white)]/70 to-[var(--accent-hover)]/70 bg-clip-text text-transparent">
              DevL
            </span>
            <span className="relative inline-block text-red-500 text-[1em] leading-none" style={{ verticalAlign: 'baseline' }}>
              Ø
            </span>
            <span className="relative inline-block bg-gradient-to-r from-[var(--accent-primary)]/70 via-[color-mix(in_srgb,var(--accent-primary)_70%,white)]/70 to-[var(--accent-hover)]/70 bg-clip-text text-transparent">
              vers
            </span>

          </h1>
        </div>

        <h2 className="mt-6 text-2xl md:text-3xl font-bold text-foreground">
          {t.title}
        </h2>

        <p className="mt-4 max-w-md mx-auto text-muted-foreground">
          {t.description}
        </p>

        <a
          href={`/${locale}`}
          className="mt-8 inline-flex items-center justify-center rounded-full bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] px-6 py-3 text-sm font-medium text-white transition-colors"
        >
          {t.backHome}
        </a>
      </div>
    </main>
  );
}
