import type { ReactNode } from 'react';

import {
  SHOP_CTA_INSET,
  SHOP_CTA_WAVE,
  shopCtaGradient,
} from '@/lib/shop/ui-classes';

const gradients = {
  hero: ['--shop-hero-btn-bg', '--shop-hero-btn-bg-hover'],
  shop: ['--shop-cta-bg', '--shop-cta-bg-hover'],
  success: ['--shop-hero-btn-success-bg', '--shop-hero-btn-success-bg-hover'],
} as const;

type ShopCtaContentProps = {
  children: ReactNode;
  className?: string;
  variant?: keyof typeof gradients | 'plain';
};

export function ShopCtaContent({
  children,
  className = 'relative z-10',
  variant = 'hero',
}: ShopCtaContentProps) {
  if (variant === 'plain') return <span className={className}>{children}</span>;

  const [base, hover] = gradients[variant];

  return (
    <>
      <span
        className="absolute inset-0"
        style={shopCtaGradient(base, hover)}
        aria-hidden="true"
      />
      <span
        className={SHOP_CTA_WAVE}
        style={shopCtaGradient(hover, base)}
        aria-hidden="true"
      />
      <span className={SHOP_CTA_INSET} aria-hidden="true" />
      <span className={className}>{children}</span>
    </>
  );
}
