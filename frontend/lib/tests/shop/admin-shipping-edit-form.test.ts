// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const refreshMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: refreshMock,
  }),
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}));

describe('admin shipping edit form', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('blocks submit locally when required fields are missing and links the submit button to the error alert', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { ShippingEditForm } =
      await import('@/app/[locale]/admin/shop/orders/[id]/ShippingEditForm');

    const { container } = render(
      createElement(ShippingEditForm, {
        orderId: '550e8400-e29b-41d4-a716-446655440100',
        csrfToken: 'csrf-token',
        initialShipping: {
          methodCode: 'NP_COURIER',
          cityRef: '',
          cityLabel: null,
          warehouseRef: null,
          warehouseLabel: null,
          addressLine1: 'Khreshchatyk 1',
          addressLine2: '',
          recipientFullName: '',
          recipientPhone: '',
          recipientEmail: null,
          recipientComment: null,
        },
      })
    );

    const submitButton = screen.getByRole('button', {
      name: 'shop.orders.detail.shippingEditor.save',
    });

    const form = container.querySelector('form');
    if (!form) throw new Error('ShippingEditForm form not rendered');

    fireEvent.submit(form);

    const alert = await screen.findByRole('alert');

    expect(alert).toHaveTextContent(
      'shop.orders.detail.shippingEditor.errors.invalid'
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(submitButton).toHaveAttribute('aria-describedby', alert.id);
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('requires warehouseRef locally for warehouse methods before sending PATCH', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { ShippingEditForm } =
      await import('@/app/[locale]/admin/shop/orders/[id]/ShippingEditForm');

    const { container } = render(
      createElement(ShippingEditForm, {
        orderId: '550e8400-e29b-41d4-a716-446655440101',
        csrfToken: 'csrf-token',
        initialShipping: {
          methodCode: 'NP_WAREHOUSE',
          cityRef: 'city-ref',
          cityLabel: null,
          warehouseRef: null,
          warehouseLabel: null,
          addressLine1: null,
          addressLine2: null,
          recipientFullName: 'Test User',
          recipientPhone: '+380501112233',
          recipientEmail: null,
          recipientComment: null,
        },
      })
    );

    const form = container.querySelector('form');
    if (!form) throw new Error('ShippingEditForm form not rendered');

    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'shop.orders.detail.shippingEditor.errors.invalid'
      );
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
