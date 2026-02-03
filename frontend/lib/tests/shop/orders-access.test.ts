import { NextRequest } from 'next/server';
import { beforeEach,describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(),
  },
}));

import { db } from '@/db';
import { getCurrentUser } from '@/lib/auth';

type MockUser = { id: string; role: 'user' | 'admin' };

describe('P0-SEC-1.1: GET /api/shop/orders/[id] access control', () => {
  const orderId = '00000000-0000-0000-0000-000000000000';
  const ownerId = '11111111-1111-1111-1111-111111111111';
  const otherUserId = '22222222-2222-2222-2222-222222222222';
  const adminId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  function mockDbRows(rows: any[]) {
    const builder = {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(rows),
    };
    (db.select as any).mockReturnValue(builder);
    return builder;
  }

  async function callGet(id: string) {
    const { GET } = await import('@/app/api/shop/orders/[id]/route');
    const req = new NextRequest(`http://localhost/api/shop/orders/${id}`, {
      method: 'GET',
    });

    const res = await (GET as any)(req, { params: Promise.resolve({ id }) });
    return res as Response;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('no session -> 401', async () => {
    (getCurrentUser as any).mockResolvedValue(null);

    const res = await callGet(orderId);
    expect(res.status).toBe(401);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('not owner and not admin -> 404 (hide existence)', async () => {
    const user: MockUser = { id: otherUserId, role: 'user' };
    (getCurrentUser as any).mockResolvedValue(user);

    mockDbRows([]);

    const res = await callGet(orderId);
    expect(res.status).toBe(404);
  });

  it('owner -> 200', async () => {
    const user: MockUser = { id: ownerId, role: 'user' };
    (getCurrentUser as any).mockResolvedValue(user);

    const now = new Date();
    mockDbRows([
      {
        order: {
          id: orderId,
          userId: ownerId,
          totalAmount: '10.00',
          currency: 'USD',
          paymentStatus: 'pending',
          paymentProvider: 'stripe',
          paymentIntentId: null,
          stockRestored: false,
          restockedAt: null,
          idempotencyKey: 'idem_key',
          createdAt: now,
          updatedAt: now,
        },
        item: null,
      },
    ]);

    const res = await callGet(orderId);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json?.success).toBe(true);
    expect(json?.order?.id).toBe(orderId);
    expect(json?.order?.userId).toBe(ownerId);
  });

  it('admin -> 200', async () => {
    const user: MockUser = { id: adminId, role: 'admin' };
    (getCurrentUser as any).mockResolvedValue(user);

    const now = new Date();
    mockDbRows([
      {
        order: {
          id: orderId,
          userId: ownerId,
          totalAmount: '10.00',
          currency: 'USD',
          paymentStatus: 'pending',
          paymentProvider: 'stripe',
          paymentIntentId: null,
          stockRestored: false,
          restockedAt: null,
          idempotencyKey: 'idem_key',
          createdAt: now,
          updatedAt: now,
        },
        item: null,
      },
    ]);

    const res = await callGet(orderId);
    expect(res.status).toBe(200);
  });
});
