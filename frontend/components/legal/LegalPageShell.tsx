import { Link } from '@/i18n/routing';
import { getTranslations } from 'next-intl/server';

type Props = {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
};

export default async function LegalPageShell({
  title,
  lastUpdated,
  children,
}: Props) {
  const t = await getTranslations('legal');

  return (
    <main
      className="
        relative min-h-screen overflow-hidden
        bg-white text-slate-900
        dark:bg-neutral-950 dark:text-slate-100
      "
    >
      <div
        aria-hidden="true"
        className="
          pointer-events-none absolute inset-0
          dark:opacity-80 opacity-100
          [background-image:
            radial-gradient(1000px_700px_at_20%_10%,rgba(59,130,246,0.10),transparent),
            radial-gradient(900px_600px_at_80%_20%,rgba(168,85,247,0.10),transparent)
          ]
          dark:[background-image:
            radial-gradient(1000px_700px_at_20%_10%,rgba(59,130,246,0.18),transparent),
            radial-gradient(900px_600px_at_80%_20%,rgba(168,85,247,0.16),transparent)
          ]
        "
      />
      <div
        aria-hidden="true"
        className="
          pointer-events-none absolute inset-0
          opacity-0 dark:opacity-40
          [background-image:radial-gradient(circle,rgba(148,163,184,0.18)_1px,transparent_1px)]
          [background-size:22px_22px]
        "
      />

      <div className="relative mx-auto max-w-4xl px-6 py-12 sm:py-16">
        <header className="space-y-5">
          <Link
            href="/"
            className="inline-flex text-sm text-slate-600 hover:text-blue-600 transition-colors dark:text-slate-300 dark:hover:text-white"
          >
            ← {t('back')}
          </Link>

          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            {title}
          </h1>

          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <span>DevLovers</span>
            <span className="opacity-60">•</span>
            <address className="not-italic">
              <a
                href={`mailto:${t('contactEmail')}`}
                className="underline underline-offset-4 hover:text-blue-600 dark:hover:text-white transition-colors"
              >
                {t('contactEmail')}
              </a>
            </address>
            <span className="opacity-60">•</span>
            <span>
              {t('lastUpdated')}: <span className="font-medium">{lastUpdated}</span>
            </span>
          </div>
        </header>

        <article className="mt-10">{children}</article>
      </div>
    </main>
  );
}
