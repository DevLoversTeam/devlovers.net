// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
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
    ...props
  }: {
    href: string;
    children: ReactNode;
  } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
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
      screen.getByTestId('footer-legal-link-seller-information')
    ).toHaveAttribute('href', '/seller-information');
    expect(
      screen.getByTestId('footer-legal-link-payment-policy')
    ).toHaveTextContent('Payment');
    expect(
      screen.getByTestId('footer-legal-link-payment-policy')
    ).toHaveAttribute('href', '/payment-policy');
    expect(
      screen.getByTestId('footer-legal-link-delivery-policy')
    ).toHaveAttribute('href', '/delivery-policy');
    expect(
      screen.getByTestId('footer-legal-link-returns-policy')
    ).toHaveAttribute('href', '/returns-policy');
    expect(
      screen.getByTestId('footer-legal-link-privacy-policy')
    ).toHaveAttribute('href', '/privacy-policy');
    expect(
      screen.getByTestId('footer-legal-link-terms-of-service')
    ).toHaveAttribute('href', '/terms-of-service');
  });

  it('does not expose shop-only legal links outside shop scope', () => {
    navigationState.pathname = '/en/about';
    navigationState.segments = ['about'];

    render(<Footer />);

    expect(
      screen.queryByTestId('footer-legal-link-seller-information')
    ).toBeNull();
    expect(screen.queryByTestId('footer-legal-link-payment-policy')).toBeNull();
    expect(
      screen.queryByTestId('footer-legal-link-delivery-policy')
    ).toBeNull();
    expect(screen.queryByTestId('footer-legal-link-returns-policy')).toBeNull();
    expect(
      screen.getByTestId('footer-legal-link-privacy-policy')
    ).toHaveAttribute('href', '/privacy-policy');
    expect(
      screen.getByTestId('footer-legal-link-terms-of-service')
    ).toHaveAttribute('href', '/terms-of-service');
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
