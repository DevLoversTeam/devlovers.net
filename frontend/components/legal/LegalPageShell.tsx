import { getTranslations } from 'next-intl/server';

import LegalBackButton from '@/components/legal/LegalBackButton';
import { getPublicSupportEmail } from '@/lib/legal/public-contact';

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
  const contactEmail = getPublicSupportEmail();

  return (
    <main className="relative min-h-screen overflow-hidden bg-white text-slate-900 dark:bg-neutral-950 dark:text-slate-100">
      <div
        aria-hidden="true"
        className="[background-image: radial-gradient(1000px_700px_at_20%_10%,rgba(59,130,246,0.10),transparent), radial-gradient(900px_600px_at_80%_20%,rgba(168,85,247,0.10),transparent) ] dark:[background-image: radial-gradient(1000px_700px_at_20%_10%,rgba(59,130,246,0.18),transparent), radial-gradient(900px_600px_at_80%_20%,rgba(168,85,247,0.16),transparent) ] pointer-events-none absolute inset-0 opacity-100 dark:opacity-80"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,rgba(148,163,184,0.18)_1px,transparent_1px)] bg-size-[22px_22px] opacity-0 dark:opacity-40"
      />

      <div className="relative mx-auto max-w-4xl px-6 py-12 sm:py-16">
        <header className="space-y-5">
          <LegalBackButton label={t('back')} />

          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            {title}
          </h1>

          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <span>DevLovers</span>
            <span className="opacity-60">•</span>
            <address className="not-italic">
              <a
                href={`mailto:${contactEmail}`}
                className="underline underline-offset-4 transition-colors hover:text-blue-600 dark:hover:text-white"
              >
                {contactEmail}
              </a>
            </address>
            <span className="opacity-60">•</span>
            <span>
              {t('lastUpdated')}:{' '}
              <span className="font-medium">{lastUpdated}</span>
            </span>
          </div>
        </header>

        <article className="mt-10">{children}</article>
      </div>
    </main>
  );
}
