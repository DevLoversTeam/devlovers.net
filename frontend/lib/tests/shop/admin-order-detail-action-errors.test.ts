// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CancelPaymentButton } from '@/app/[locale]/admin/shop/orders/[id]/CancelPaymentButton';
import { RefundButton } from '@/app/[locale]/admin/shop/orders/[id]/RefundButton';
import { ShippingActions } from '@/app/[locale]/admin/shop/orders/[id]/ShippingActions';

const refreshMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: refreshMock,
  }),
}));

const translations: Record<string, string> = {
  'shop.orders.detail.shippingControls.recoverInitialShipment':
    'Recover shipment',
  'shop.orders.detail.shippingControls.retryLabelCreation': 'Retry label',
  'shop.orders.detail.shippingControls.markShipped': 'Mark shipped',
  'shop.orders.detail.shippingControls.markDelivered': 'Mark delivered',
  'shop.orders.detail.shippingControls.errors.network':
    'Shipping action failed to send. Try again.',
  'shop.orders.detail.shippingControls.errors.security':
    'Security check failed. Refresh the page and try again.',
  'shop.orders.detail.shippingControls.errors.recoverNotAvailable':
    'Shipment recovery is no longer available for this order.',
  'shop.orders.detail.shippingControls.errors.shipmentMissing':
    'There is no shipment record to update yet.',
  'shop.orders.detail.shippingControls.errors.retryNotAvailable':
    'Label retry is not available in the current shipment state.',
  'shop.orders.detail.shippingControls.errors.transitionNotAvailable':
    'This shipping step is no longer available for the current order state.',
  'shop.orders.detail.shippingControls.errors.adminDisabled':
    'Admin shipping actions are currently unavailable.',
  'shop.orders.detail.shippingControls.errors.generic':
    'Shipping action could not be completed. Refresh the order and try again.',
  'shop.orders.detail.paymentControls.refund': 'Refund payment',
  'shop.orders.detail.paymentControls.refunding': 'Refundingâ€¦',
  'shop.orders.detail.paymentControls.onlyForPaidStripe':
    'Refund is only available for paid Stripe orders',
  'shop.orders.detail.paymentControls.cancelUnpaidPayment':
    'Cancel unpaid payment',
  'shop.orders.detail.paymentControls.cancelingPayment': 'Canceling paymentâ€¦',
  'shop.orders.detail.paymentControls.onlyForUnpaidMonobank':
    'This action is only available for unpaid Monobank orders',
  'shop.orders.detail.paymentControls.errors.network':
    'Payment action failed to send. Try again.',
  'shop.orders.detail.paymentControls.errors.security':
    'Security check failed. Refresh the page and try again.',
  'shop.orders.detail.paymentControls.errors.refundNotAvailable':
    'Refund is no longer available for this order.',
  'shop.orders.detail.paymentControls.errors.cancelPaymentDisabled':
    'Payment cancel is currently unavailable.',
  'shop.orders.detail.paymentControls.errors.cancelPaymentNotAvailable':
    'Unpaid cancel is no longer available for this order.',
  'shop.orders.detail.paymentControls.errors.cancelPaymentInProgress':
    'Payment cancel is already being processed. Refresh in a moment.',
  'shop.orders.detail.paymentControls.errors.missingPaymentReference':
    'The payment provider reference is missing, so this action cannot run automatically.',
  'shop.orders.detail.paymentControls.errors.invalidAmount':
    'Order amount data is incomplete, so refund cannot start automatically.',
  'shop.orders.detail.paymentControls.errors.providerUnavailable':
    'The payment provider is temporarily unavailable. Try again later.',
  'shop.orders.detail.paymentControls.errors.adminDisabled':
    'Admin payment actions are currently unavailable.',
  'shop.orders.detail.paymentControls.errors.generic':
    'Payment action could not be completed. Refresh the order and try again.',
};

vi.mock('next-intl', () => ({
  useTranslations:
    (namespace: string) =>
    (key: string): string =>
      translations[`${namespace}.${key}`] ?? `${namespace}.${key}`,
}));

describe('admin order detail action error messages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('maps shipping backend codes to friendly admin copy', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ code: 'INVALID_SHIPPING_TRANSITION' }),
    } as Response);

    render(
      createElement(ShippingActions, {
        orderId: 'order-1',
        csrfToken: 'csrf',
        shippingStatus: 'label_created',
        shipmentStatus: 'succeeded',
      })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mark shipped' }));

    await waitFor(() => {
      expect(
        screen.getByText(
          'This shipping step is no longer available for the current order state.'
        )
      ).toBeTruthy();
    });
    expect(screen.queryByText('INVALID_SHIPPING_TRANSITION')).toBeNull();
  });

  it('maps refund backend codes to friendly admin copy', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ code: 'PSP_UNAVAILABLE' }),
    } as Response);

    render(
      createElement(RefundButton, {
        orderId: 'order-1',
        disabled: false,
        csrfToken: 'csrf',
      })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Refund payment' }));

    await waitFor(() => {
      expect(
        screen.getByText(
          'The payment provider is temporarily unavailable. Try again later.'
        )
      ).toBeTruthy();
    });
    expect(screen.queryByText('PSP_UNAVAILABLE')).toBeNull();
  });

  it('maps refund network failures to the localized network message', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'));

    render(
      createElement(RefundButton, {
        orderId: 'order-1',
        disabled: false,
        csrfToken: 'csrf',
      })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Refund payment' }));

    await waitFor(() => {
      expect(
        screen.getByText('Payment action failed to send. Try again.')
      ).toBeTruthy();
    });
    expect(screen.queryByText('Failed to fetch')).toBeNull();
  });

  it('prefers API error over code and message for cancel-payment extraction', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({
        error: 'CANCEL_IN_PROGRESS',
        code: 'CANCEL_DISABLED',
        message: 'HTTP conflict',
      }),
    } as Response);

    render(
      createElement(CancelPaymentButton, {
        orderId: 'order-1',
        disabled: false,
        csrfToken: 'csrf',
      })
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Cancel unpaid payment' })
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          'Payment cancel is already being processed. Refresh in a moment.'
        )
      ).toBeTruthy();
    });
    expect(
      screen.queryByText('Payment cancel is currently unavailable.')
    ).toBeNull();
  });

  it('maps cancel-payment backend codes to friendly admin copy', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ code: 'CANCEL_IN_PROGRESS' }),
    } as Response);

    render(
      createElement(CancelPaymentButton, {
        orderId: 'order-1',
        disabled: false,
        csrfToken: 'csrf',
      })
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Cancel unpaid payment' })
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          'Payment cancel is already being processed. Refresh in a moment.'
        )
      ).toBeTruthy();
    });
    expect(screen.queryByText('CANCEL_IN_PROGRESS')).toBeNull();
  });

  it('maps cancel-payment network failures to the localized network message', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'));

    render(
      createElement(CancelPaymentButton, {
        orderId: 'order-1',
        disabled: false,
        csrfToken: 'csrf',
      })
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Cancel unpaid payment' })
    );

    await waitFor(() => {
      expect(
        screen.getByText('Payment action failed to send. Try again.')
      ).toBeTruthy();
    });
    expect(screen.queryByText('Failed to fetch')).toBeNull();
  });

  it('maps shipping network failures to the localized network message', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'));

    render(
      createElement(ShippingActions, {
        orderId: 'order-1',
        csrfToken: 'csrf',
        shippingStatus: 'label_created',
        shipmentStatus: 'succeeded',
      })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mark shipped' }));

    await waitFor(() => {
      expect(
        screen.getByText('Shipping action failed to send. Try again.')
      ).toBeTruthy();
    });
    expect(screen.queryByText('Failed to fetch')).toBeNull();
  });
});
