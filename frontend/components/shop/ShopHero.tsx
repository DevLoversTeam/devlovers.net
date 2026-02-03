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
      className="bg-background relative overflow-hidden"
      aria-labelledby="shop-hero-title"
    >
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8 lg:py-36">
        <div className="mx-auto max-w-3xl text-center">
          <h1
            id="shop-hero-title"
            className="relative inline-block pb-2 text-4xl leading-[1.08] font-black tracking-tight text-balance sm:text-5xl lg:text-6xl"
          >
            <span className="from-foreground/80 via-foreground to-foreground/80 relative inline-block bg-gradient-to-r bg-clip-text text-transparent dark:from-[var(--accent-primary)]/70 dark:via-[color-mix(in_srgb,var(--accent-primary)_70%,white)]/70 dark:to-[var(--accent-hover)]/70">
              {headline}
            </span>

            <span
              className="from-foreground via-foreground to-foreground wave-text-gradient pointer-events-none absolute inset-0 inline-block bg-gradient-to-r bg-clip-text text-transparent dark:from-[var(--accent-primary)] dark:via-[color-mix(in_srgb,var(--accent-primary)_70%,white)] dark:to-[var(--accent-hover)]"
              aria-hidden="true"
            >
              {headline}
            </span>
          </h1>

          <p className="text-muted-foreground mx-auto mt-6 max-w-xl text-sm font-light text-pretty sm:text-base md:text-lg">
            {subheadline}
          </p>

          <div className="mt-10">
            <Link
              href={ctaLink}
              className={` ${SHOP_CTA_BASE} ${SHOP_FOCUS} px-8 py-3 text-white shadow-[var(--shop-hero-btn-shadow)] hover:shadow-[var(--shop-hero-btn-shadow-hover)] sm:px-10 md:px-12 md:py-3.5 lg:py-4`}
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
