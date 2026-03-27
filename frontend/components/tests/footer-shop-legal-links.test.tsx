// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Footer from '@/components/shared/Footer';

const navigationState = vi.hoisted(() => ({
  pathname: '/en/shop/products',
  segments: ['shop'] as string[],
}));

const footerTranslations: Record<string, string> = {
  builtWith: 'Built by',
  byCommunity: 'community.',
  sellerInformation: 'Seller Information',
  payment: 'Payment',
  delivery: 'Delivery',
  returns: 'Returns',
  privacyPolicy: 'Privacy Policy',
  termsOfService: 'Terms of Service',
};

vi.mock('lucide-react', () => ({
  Github: () => null,
  Linkedin: () => null,
  Send: () => null,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => navigationState.pathname,
  useSelectedLayoutSegments: () => navigationState.segments,
}));

vi.mock('next-intl', () => ({
  useTranslations:
    () =>
    (key: string): string =>
      footerTranslations[key] ?? key,
}));

vi.mock('@/components/theme/ThemeToggle', () => ({
  ThemeToggle: () => <button type="button">Theme</button>,
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

describe('shared footer shop legal links', () => {
  beforeEach(() => {
    navigationState.pathname = '/en/shop/products';
    navigationState.segments = ['shop'];
  });

  it('shows all required legal links in shop scope', () => {
    render(<Footer />);

    expect(
      screen.getByRole('link', { name: 'Seller Information' })
    ).toHaveAttribute('href', '/seller-information');
    expect(screen.getByRole('link', { name: 'Payment' })).toHaveAttribute(
      'href',
      '/payment-policy'
    );
    expect(screen.getByRole('link', { name: 'Delivery' })).toHaveAttribute(
      'href',
      '/delivery-policy'
    );
    expect(screen.getByRole('link', { name: 'Returns' })).toHaveAttribute(
      'href',
      '/returns-policy'
    );
    expect(
      screen.getByRole('link', { name: 'Privacy Policy' })
    ).toHaveAttribute('href', '/privacy-policy');
    expect(
      screen.getByRole('link', { name: 'Terms of Service' })
    ).toHaveAttribute('href', '/terms-of-service');
  });

  it('does not expose shop-only legal links outside shop scope', () => {
    navigationState.pathname = '/en/about';
    navigationState.segments = ['about'];

    render(<Footer />);

    expect(
      screen.queryByRole('link', { name: 'Seller Information' })
    ).toBeNull();
    expect(screen.queryByRole('link', { name: 'Payment' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Delivery' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Returns' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toBeTruthy();
  });

  it('preserves hidden-on-home behavior unless forceVisible is enabled', () => {
    navigationState.pathname = '/en';
    navigationState.segments = [];

    const { container, rerender } = render(<Footer />);

    expect(container.firstChild).toBeNull();

    rerender(<Footer forceVisible />);

    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toBeTruthy();
  });
});
