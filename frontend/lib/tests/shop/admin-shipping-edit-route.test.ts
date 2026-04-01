import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdminApiMock = vi.hoisted(() =>
  vi.fn(async () => ({ id: 'admin-route-1' }))
);
const requireAdminCsrfMock = vi.hoisted(() => vi.fn(() => null));
const guardBrowserSameOriginMock = vi.hoisted(() => vi.fn(() => null));
const applyAdminOrderShippingEditMock = vi.hoisted(() =>
  vi.fn(async () => ({
    orderId: '550e8400-e29b-41d4-a716-446655440000',
    shippingMethodCode: 'NP_COURIER',
    changed: true,
  }))
);
const logWarnMock = vi.hoisted(() => vi.fn());
const logErrorMock = vi.hoisted(() => vi.fn());

const adminAuthErrors = vi.hoisted(() => {
  class AdminApiDisabledError extends Error {
    code = 'ADMIN_API_DISABLED';
  }

  class AdminUnauthorizedError extends Error {
    code = 'UNAUTHORIZED';
  }

  class AdminForbiddenError extends Error {
    code = 'FORBIDDEN';
  }

  return {
    AdminApiDisabledError,
    AdminUnauthorizedError,
    AdminForbiddenError,
  };
});

const shippingEditErrors = vi.hoisted(() => {
  class AdminOrderShippingEditError extends Error {
    code: string;
    status: number;

    constructor(code: string, message: string, status: number) {
      super(message);
      this.code = code;
      this.status = status;
    }
  }

  return {
    AdminOrderShippingEditError,
  };
});

vi.mock('@/lib/auth/admin', () => ({
  ...adminAuthErrors,
  requireAdminApi: (request: unknown) => (requireAdminApiMock as any)(request),
}));

vi.mock('@/lib/security/admin-csrf', () => ({
  requireAdminCsrf: (...args: unknown[]) =>
    (requireAdminCsrfMock as any)(...args),
}));

vi.mock('@/lib/security/origin', () => ({
  guardBrowserSameOrigin: (request: unknown) =>
    (guardBrowserSameOriginMock as any)(request),
}));

vi.mock('@/lib/services/shop/shipping/admin-edit', () => ({
  ...shippingEditErrors,
  applyAdminOrderShippingEdit: (args: unknown) =>
    (applyAdminOrderShippingEditMock as any)(args),
}));

vi.mock('@/lib/logging', () => ({
  logWarn: (...args: unknown[]) => logWarnMock(...args),
  logError: (...args: unknown[]) => logErrorMock(...args),
}));

import { PATCH } from '@/app/api/shop/admin/orders/[id]/shipping/route';

describe('admin shipping edit route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts a valid courier payload and delegates to the shipping edit service', async () => {
    const orderId = '550e8400-e29b-41d4-a716-446655440000';
    const requestId = 'req_admin_shipping_edit_route';
    const request = new NextRequest(
      `http://localhost/api/shop/admin/orders/${orderId}/shipping`,
      {
        method: 'PATCH',
        headers: {
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
          'x-csrf-token': 'csrf-token',
          'x-request-id': requestId,
        },
        body: JSON.stringify({
          provider: 'nova_poshta',
          methodCode: 'NP_COURIER',
          selection: {
            cityRef: '12345678901234567890',
            addressLine1: 'Khreshchatyk 1',
            addressLine2: 'Apartment 10',
          },
          recipient: {
            fullName: 'Test User',
            phone: '+380501112233',
            email: 'test@example.com',
            comment: 'Ring the bell',
          },
        }),
      }
    );

    const response = await PATCH(request, {
      params: Promise.resolve({ id: orderId }),
    });

    expect(response.status).toBe(200);
    expect(requireAdminCsrfMock).toHaveBeenCalledWith(
      expect.any(NextRequest),
      'admin:orders:shipping:edit'
    );
    expect(applyAdminOrderShippingEditMock).toHaveBeenCalledWith({
      orderId,
      actorUserId: 'admin-route-1',
      requestId,
      shipping: {
        provider: 'nova_poshta',
        methodCode: 'NP_COURIER',
        selection: {
          cityRef: '12345678901234567890',
          addressLine1: 'Khreshchatyk 1',
          addressLine2: 'Apartment 10',
        },
        recipient: {
          fullName: 'Test User',
          phone: '+380501112233',
          email: 'test@example.com',
          comment: 'Ring the bell',
        },
      },
    });

    await expect(response.json()).resolves.toEqual({
      success: true,
      changed: true,
      order: {
        id: orderId,
        shippingMethodCode: 'NP_COURIER',
      },
    });
  });

  it('rejects invalid warehouse payloads before the service runs', async () => {
    const request = new NextRequest(
      'http://localhost/api/shop/admin/orders/550e8400-e29b-41d4-a716-446655440000/shipping',
      {
        method: 'PATCH',
        headers: {
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
          'x-csrf-token': 'csrf-token',
        },
        body: JSON.stringify({
          provider: 'nova_poshta',
          methodCode: 'NP_WAREHOUSE',
          selection: {
            cityRef: '12345678901234567890',
          },
          recipient: {
            fullName: 'Test User',
            phone: '+380501112233',
          },
        }),
      }
    );

    const response = await PATCH(request, {
      params: Promise.resolve({
        id: '550e8400-e29b-41d4-a716-446655440000',
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: 'INVALID_PAYLOAD',
      message: 'Invalid payload.',
    });
    expect(applyAdminOrderShippingEditMock).not.toHaveBeenCalled();
  });

  it('returns controlled service errors for blocked shipping edits', async () => {
    applyAdminOrderShippingEditMock.mockRejectedValueOnce(
      new shippingEditErrors.AdminOrderShippingEditError(
        'SHIPPING_EDIT_NOT_ALLOWED',
        'Shipping details cannot be edited in the current fulfillment state.',
        409
      )
    );

    const request = new NextRequest(
      'http://localhost/api/shop/admin/orders/550e8400-e29b-41d4-a716-446655440000/shipping',
      {
        method: 'PATCH',
        headers: {
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
          'x-csrf-token': 'csrf-token',
        },
        body: JSON.stringify({
          provider: 'nova_poshta',
          methodCode: 'NP_COURIER',
          selection: {
            cityRef: '12345678901234567890',
            addressLine1: 'Khreshchatyk 1',
          },
          recipient: {
            fullName: 'Test User',
            phone: '+380501112233',
          },
        }),
      }
    );

    const response = await PATCH(request, {
      params: Promise.resolve({
        id: '550e8400-e29b-41d4-a716-446655440000',
      }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: 'SHIPPING_EDIT_NOT_ALLOWED',
      message:
        'Shipping details cannot be edited in the current fulfillment state.',
    });
    expect(logWarnMock).toHaveBeenCalledWith(
      'admin_orders_shipping_edit_rejected',
      expect.objectContaining({
        code: 'SHIPPING_EDIT_NOT_ALLOWED',
      })
    );
  });
});
