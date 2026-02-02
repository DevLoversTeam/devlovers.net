import { Link } from '@/i18n/routing';
interface HeroProps {
  headline: string;
  subheadline: string;
  ctaText: string;
  ctaLink: string;
}
import {
  SHOP_CTA_BASE,
  SHOP_CTA_INSET,
  SHOP_CTA_WAVE,
  SHOP_FOCUS,
  shopCtaGradient,
} from '@/lib/shop/ui-classes';

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
            className="relative inline-block text-balance text-4xl font-black leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl pb-2"
          >
            <span className="relative inline-block bg-gradient-to-r from-foreground/80 via-foreground to-foreground/80 bg-clip-text text-transparent dark:from-[var(--accent-primary)]/70 dark:via-[color-mix(in_srgb,var(--accent-primary)_70%,white)]/70 dark:to-[var(--accent-hover)]/70">
              {headline}
            </span>

            <span
              className="pointer-events-none absolute inset-0 inline-block bg-gradient-to-r from-foreground via-foreground to-foreground bg-clip-text text-transparent wave-text-gradient dark:from-[var(--accent-primary)] dark:via-[color-mix(in_srgb,var(--accent-primary)_70%,white)] dark:to-[var(--accent-hover)]"
              aria-hidden="true"
            >
              {headline}
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-pretty text-sm sm:text-base md:text-lg text-muted-foreground font-light">
            {subheadline}
          </p>

          <div className="mt-10">
            <Link
              href={ctaLink}
              className={`
    ${SHOP_CTA_BASE} ${SHOP_FOCUS}
    px-8 sm:px-10 md:px-12 py-3 md:py-3.5 lg:py-4
    text-white
    shadow-[var(--shop-hero-btn-shadow)] hover:shadow-[var(--shop-hero-btn-shadow-hover)]
  `}
            >
              <span
                className="absolute inset-0"
                style={shopCtaGradient(
                  '--shop-hero-btn-bg',
                  '--shop-hero-btn-bg-hover'
                )}
                aria-hidden="true"
              />

              <span
                className={SHOP_CTA_WAVE}
                style={shopCtaGradient(
                  '--shop-hero-btn-bg-hover',
                  '--shop-hero-btn-bg'
                )}
                aria-hidden="true"
              />

              <span className={SHOP_CTA_INSET} aria-hidden="true" />

              <span className="relative z-10 flex items-center gap-2">
                <span>{ctaText}</span>
                <span
                  aria-hidden="true"
                  className="transition-transform duration-300 group-hover:translate-x-0.5"
                >
                  →
                </span>
              </span>
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
