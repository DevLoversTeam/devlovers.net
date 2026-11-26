import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as approve } from '@/app/api/shop/admin/returns/[id]/approve/route';
import { POST as receive } from '@/app/api/shop/admin/returns/[id]/receive/route';
import { POST as refund } from '@/app/api/shop/admin/returns/[id]/refund/route';
import { POST as reject } from '@/app/api/shop/admin/returns/[id]/reject/route';
import { InvalidPayloadError } from '@/lib/services/errors';

const { transition, refundReturnRequest } = vi.hoisted(() => ({
  transition: vi.fn(),
  refundReturnRequest: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getCurrentUser: async () => ({ id: 'admin', role: 'admin' }),
}));
vi.mock('@/lib/logging', async () => {
  const { createQuietLoggingMock } =
    await import('@/lib/tests/helpers/quiet-logging');
  return createQuietLoggingMock();
});
vi.mock('@/lib/security/admin-csrf', () => ({
  requireAdminCsrf: () => null,
}));
vi.mock('@/lib/services/shop/returns', () => ({
  approveReturnRequest: transition,
  receiveReturnRequest: transition,
  rejectReturnRequest: transition,
  refundReturnRequest,
}));

const origin = 'http://localhost:3000';
const id = '11111111-1111-4111-8111-111111111111';

function requestFor(action: string) {
  return new NextRequest(
    origin + '/api/shop/admin/returns/' + id + '/' + action,
    {
      method: 'POST',
      headers: { origin, 'x-request-id': 'test-request' },
    }
  );
}

beforeEach(() => {
  transition.mockReset();
  refundReturnRequest.mockReset();
});

describe('admin return response contracts', () => {
  it.each([
    ['approve', approve, 'approved'],
    ['receive', receive, 'received'],
    ['reject', reject, 'rejected'],
  ] as const)(
    'serializes %s dates and preserves other fields',
    async (action, handler, status) => {
      const createdAt = new Date('2026-01-01T00:00:00.000Z');
      const updatedAt = new Date('2026-01-02T00:00:00.000Z');
      const row = {
        id,
        status,
        reason: 'wrong size',
        createdAt,
        updatedAt,
        approvedAt: status !== 'rejected' ? updatedAt : null,
        rejectedAt: status === 'rejected' ? updatedAt : null,
        receivedAt: status === 'received' ? updatedAt : null,
        refundedAt: null,
      };
      transition.mockResolvedValue({ row, changed: true });
      const response = await handler(requestFor(action), {
        params: Promise.resolve({ id }),
      });

      expect(transition).toHaveBeenCalledWith({
        returnRequestId: id,
        actorUserId: 'admin',
        requestId: 'test-request',
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toEqual({
        success: true,
        changed: true,
        returnRequest: {
          ...row,
          createdAt: createdAt.toISOString(),
          updatedAt: updatedAt.toISOString(),
          approvedAt: row.approvedAt?.toISOString() ?? null,
          rejectedAt: row.rejectedAt?.toISOString() ?? null,
          receivedAt: row.receivedAt?.toISOString() ?? null,
        },
      });
    }
  );

  it.each([
    ['RETURN_NOT_FOUND', 404, 404],
    ['RETURN_TRANSITION_INVALID', 409, 409],
    ['RETURN_REFUND_DISABLED', 400, 409],
    ['RETURN_REFUND_STATE_INVALID', 400, 409],
    ['RETURN_REFUND_PROVIDER_UNSUPPORTED', 400, 409],
    ['RETURN_REFUND_PAYMENT_STATUS_INVALID', 400, 409],
    ['PSP_UNAVAILABLE', 400, 503],
    ['INVALID_PAYLOAD', 400, 400],
  ] as const)(
    'maps %s for transitions and refunds',
    async (code, transitionStatus, refundStatus) => {
      const details = { returnRequestId: id };
      transition.mockRejectedValue(
        new InvalidPayloadError('Fixture error', { code })
      );
      refundReturnRequest.mockRejectedValue(
        new InvalidPayloadError('Fixture error', { code, details })
      );
      const context = { params: Promise.resolve({ id }) };
      const transitionResponse = await approve(requestFor('approve'), context);
      const refundResponse = await refund(requestFor('refund'), context);

      expect(transitionResponse.status).toBe(transitionStatus);
      expect(refundResponse.status).toBe(refundStatus);
      expect(refundResponse.headers.get('cache-control')).toBe('no-store');
      expect(await transitionResponse.json()).toEqual({
        code,
        message: 'Fixture error',
      });
      expect(await refundResponse.json()).toEqual({
        code,
        message: 'Fixture error',
        details,
      });
    }
  );
});
