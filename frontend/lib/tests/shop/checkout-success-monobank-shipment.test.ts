// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import MonobankRedirectStatus from '@/app/[locale]/shop/checkout/success/MonobankRedirectStatus';

const replaceMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: replaceMock,
    refresh: vi.fn(),
  }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
    [key: string]: unknown;
  }) => createElement('a', { href, ...props }, children),
}));

describe('checkout monobank guest shipment visibility', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    replaceMock.mockReset();
    sessionStorage.clear();
  });

  it('renders shipment status and tracking from token-scoped lite status response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        id: '11111111-1111-4111-8111-111111111111',
        currency: 'UAH',
        totalAmountMinor: 1000,
        paymentStatus: 'paid',
        itemsCount: 1,
        shipmentStatus: 'needs_attention',
        trackingNumber: 'TRACK-123',
      }),
    } as Response);

    render(
      createElement(MonobankRedirectStatus, {
        orderId: '11111111-1111-4111-8111-111111111111',
        locale: 'en',
        initialStatusToken: 'token_test',
        paymentsDisabled: false,
      })
    );

    await screen.findByText('TRACK-123');

    expect(screen.getByText('shipmentStatuses.needsAttention')).toBeTruthy();
    expect(screen.getByText('shippingStatus')).toBeTruthy();
    expect(screen.getByText('trackingNumber')).toBeTruthy();
    expect(screen.queryByText('needs_attention')).toBeNull();
  });

  it('omits shipment rows when lite status response has no shipment data', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        id: '11111111-1111-4111-8111-111111111111',
        currency: 'UAH',
        totalAmountMinor: 1000,
        paymentStatus: 'paid',
        itemsCount: 1,
        shipmentStatus: null,
        trackingNumber: null,
      }),
    } as Response);

    render(
      createElement(MonobankRedirectStatus, {
        orderId: '11111111-1111-4111-8111-111111111111',
        locale: 'en',
        initialStatusToken: 'token_test',
        paymentsDisabled: false,
      })
    );

    await waitFor(() =>
      expect(screen.getByText('paymentStatus.paid')).toBeTruthy()
    );

    expect(screen.queryByText('shippingStatus')).toBeNull();
    expect(screen.queryByText('trackingNumber')).toBeNull();
  });
});
