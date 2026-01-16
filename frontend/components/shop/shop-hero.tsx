// C:\Users\milka\devlovers.net-clean\frontend\components\shop\shop-hero.tsx

import { Link } from '@/i18n/routing';

interface HeroProps {
  headline: string;
  subheadline: string;
  ctaText: string;
  ctaLink: string;
}

export function Hero({ headline, subheadline, ctaText, ctaLink }: HeroProps) {
  return (
    <section
      className="relative overflow-hidden bg-background"
      aria-labelledby="shop-hero-title"
    >
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8 lg:py-36">
        <div className="mx-auto max-w-3xl text-center">
          <h1
            id="shop-hero-title"
            className="text-balance text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl"
          >
            {headline}
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-pretty text-lg text-muted-foreground">
            {subheadline}
          </p>

          <div className="mt-10">
            <Link
              href={ctaLink}
              className="inline-flex items-center gap-2 rounded-md bg-foreground px-6 py-3 text-sm font-semibold uppercase tracking-wide text-background transition-colors hover:bg-foreground/90"
              aria-label={ctaText}
            >
              <span>{ctaText}</span>
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </div>

      <div
        className="absolute inset-0 -z-10 opacity-30"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(255, 45, 85, 0.15), transparent)',
        }}
      />
    </section>
  );
}
