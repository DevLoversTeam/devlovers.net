import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WriteAdminAuditArgs } from '@/lib/services/shop/events/write-admin-audit';

const adminUser = {
  id: 'admin_order_audit_1',
  role: 'admin',
};

const refundOrderMock = vi.hoisted(() => vi.fn());
const cancelMonobankUnpaidPaymentMock = vi.hoisted(() => vi.fn());
const writeAdminAuditMock = vi.hoisted(() =>
  vi.fn(async (..._call: [WriteAdminAuditArgs, { db?: unknown }?]) => {
    void _call;
    return {
      inserted: true,
      dedupeKey: 'admin_audit:v1:test',
      id: 'audit_row_1',
    };
  })
);

vi.mock('@/lib/auth/admin', () => {
  class AdminApiDisabledError extends Error {
    code = 'ADMIN_API_DISABLED' as const;
  }
  class AdminUnauthorizedError extends Error {
    code = 'ADMIN_UNAUTHORIZED' as const;
  }
  class AdminForbiddenError extends Error {
    code = 'ADMIN_FORBIDDEN' as const;
  }

  return {
    AdminApiDisabledError,
    AdminUnauthorizedError,
    AdminForbiddenError,
    requireAdminApi: vi.fn(async () => adminUser),
  };
});

vi.mock('@/lib/security/admin-csrf', () => ({
  requireAdminCsrf: vi.fn(() => null),
}));

vi.mock('@/lib/security/rate-limit', async () => {
  const actual = await vi.importActual<any>('@/lib/security/rate-limit');
  return {
    ...actual,
    getRateLimitSubject: vi.fn(() => 'rl_admin_order_audit_test'),
    enforceRateLimit: vi.fn(async () => ({ ok: true, retryAfterSeconds: 0 })),
  };
});

vi.mock('@/lib/logging', async () => {
  const actual = await vi.importActual<any>('@/lib/logging');
  return {
    ...actual,
    logWarn: () => {},
    logError: () => {},
  };
});

vi.mock('@/lib/services/orders', () => ({
  refundOrder: refundOrderMock,
}));

vi.mock('@/lib/services/orders/monobank-cancel-payment', () => ({
  cancelMonobankUnpaidPayment: cancelMonobankUnpaidPaymentMock,
}));

vi.mock('@/lib/services/shop/events/write-admin-audit', () => ({
  writeAdminAudit: writeAdminAuditMock,
}));

describe('admin order payment audit routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refund route writes canonical order audit after successful refund request', async () => {
    const orderId = '550e8400-e29b-41d4-a716-446655440000';
    const requestId = 'req_refund_route_audit';

    refundOrderMock.mockResolvedValue({
      id: orderId,
      totalAmountMinor: 2500,
      totalAmount: 25,
      currency: 'USD',
      paymentStatus: 'paid',
      fulfillmentStage: 'processing',
      paymentProvider: 'stripe',
      paymentIntentId: 'pi_test_123',
      createdAt: new Date('2026-03-31T12:00:00.000Z'),
      items: [],
      pspStatusReason: 'REFUND_REQUESTED',
    });

    const { POST } =
      await import('@/app/api/shop/admin/orders/[id]/refund/route');
    const request = new NextRequest(
      `http://localhost/api/shop/admin/orders/${orderId}/refund`,
      {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
          'x-request-id': requestId,
        },
      }
    );

    const response = await POST(request, {
      params: Promise.resolve({ id: orderId }),
    });

    expect(response.status).toBe(200);
    expect(writeAdminAuditMock).toHaveBeenCalledTimes(1);
    expect(writeAdminAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId,
        actorUserId: adminUser.id,
        action: 'order_admin_action.refund',
        targetType: 'order',
        targetId: orderId,
        requestId,
        payload: expect.objectContaining({
          action: 'refund',
          paymentProvider: 'stripe',
          paymentStatus: 'paid',
          fulfillmentStage: 'processing',
        }),
        dedupeSeed: {
          domain: 'order_admin_action',
          action: 'refund',
          orderId,
        },
      })
    );
  });

  it('cancel-payment route writes canonical order audit after successful unpaid cancel', async () => {
    const orderId = '550e8400-e29b-41d4-a716-446655440001';
    const requestId = 'req_cancel_payment_route_audit';

    cancelMonobankUnpaidPaymentMock.mockResolvedValue({
      order: {
        id: orderId,
        totalAmountMinor: 2500,
        totalAmount: 25,
        currency: 'UAH',
        paymentStatus: 'failed',
        fulfillmentStage: 'canceled',
        paymentProvider: 'monobank',
        paymentIntentId: null,
        createdAt: new Date('2026-03-31T12:00:00.000Z'),
        items: [],
      },
      cancel: {
        id: 'cancel_row_1',
        extRef: `mono_cancel:${orderId}`,
        status: 'success',
        deduped: false,
      },
    });

    const { POST } =
      await import('@/app/api/shop/admin/orders/[id]/cancel-payment/route');
    const request = new NextRequest(
      `http://localhost/api/shop/admin/orders/${orderId}/cancel-payment`,
      {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
          'x-request-id': requestId,
        },
      }
    );

    const response = await POST(request, {
      params: Promise.resolve({ id: orderId }),
    });

    expect(response.status).toBe(200);
    expect(writeAdminAuditMock).toHaveBeenCalledTimes(1);
    expect(writeAdminAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId,
        actorUserId: adminUser.id,
        action: 'order_admin_action.cancel_payment',
        targetType: 'order',
        targetId: orderId,
        requestId,
        payload: expect.objectContaining({
          action: 'cancel_payment',
          paymentProvider: 'monobank',
          paymentStatus: 'failed',
          fulfillmentStage: 'canceled',
          cancelStatus: 'success',
          cancelExtRef: `mono_cancel:${orderId}`,
          deduped: false,
        }),
        dedupeSeed: {
          domain: 'order_admin_action',
          action: 'cancel_payment',
          orderId,
        },
      })
    );
  });
});
