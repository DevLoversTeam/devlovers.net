import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

let updateReturningRows: any[] = [];
let selectQueue: any[][] = [];
let capturedSetPayload: any = null;

const updateMock = vi.fn(() => ({
  set: vi.fn((payload: any) => {
    capturedSetPayload = payload;
    return {
      where: vi.fn(() => ({
        returning: vi.fn(async () => updateReturningRows),
      })),
    };
  }),
}));

const selectMock = vi.fn(() => ({
  from: vi.fn(() => ({
    where: vi.fn(() => ({
      limit: vi.fn(async () => selectQueue.shift() ?? []),
    })),
  })),
}));

vi.mock('@/lib/logging', () => ({
  logWarn: vi.fn(),
}));

vi.mock('@/db', () => ({
  db: {
    update: () => updateMock(),
    select: () => selectMock(),
  },
}));

vi.mock('@/db/schema/shop', () => ({
  // minimal runtime shape needed by payment-state.ts
  orders: {
    id: 'orders.id',
    paymentStatus: 'orders.payment_status',
    paymentProvider: 'orders.payment_provider',
  },
}));

let mod: typeof import('@/lib/services/orders/payment-state');
let log: typeof import('@/lib/logging');

beforeAll(async () => {
  mod = await import('@/lib/services/orders/payment-state');
  log = await import('@/lib/logging');
});

beforeEach(() => {
  vi.clearAllMocks();
  updateReturningRows = [];
  selectQueue = [];
  capturedSetPayload = null;
});

describe('P1-6 payment state machine helper', () => {
  it('fixes the transition matrix (regression guard)', () => {
    expect(
      mod.__paymentTransitions.allowedFrom('stripe' as any, 'refunded' as any)
    ).toEqual(['paid', 'pending', 'requires_payment']);
  });

  it('allowed transition applies guarded UPDATE (no transaction)', async () => {
    updateReturningRows = [{ id: 'o1' }];

    const res = await mod.guardedPaymentStatusUpdate({
      orderId: 'o1',
      paymentProvider: 'stripe',
      to: 'paid',
      source: 'system',
      eventId: 'evt_1',
      note: 'test',
      set: { updatedAt: new Date(), status: 'PAID' } as any,
    });

    expect(res).toEqual({ applied: true });
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(capturedSetPayload).toBeTruthy();
    expect(capturedSetPayload.paymentStatus).toBe('paid');
    expect(log.logWarn as any).not.toHaveBeenCalled();
  });

  it('forbidden transition does not change state and logs warn', async () => {
    // simulate "no row updated"
    updateReturningRows = [];
    // current state returned by getCurrentState() after failed update
    selectQueue = [[{ paymentStatus: 'failed', paymentProvider: 'stripe' }]];

    const res = await mod.guardedPaymentStatusUpdate({
      orderId: 'o2',
      paymentProvider: 'stripe',
      to: 'paid', // failed -> paid is forbidden by matrix
      source: 'system',
      eventId: 'evt_2',
      note: 'test-forbidden',
      set: { updatedAt: new Date() } as any,
    });
    
    expect(res.applied).toBe(false);
    if (res.applied) throw new Error('expected not applied');
    expect(res.reason).toBe('INVALID_TRANSITION');
    expect(log.logWarn).toHaveBeenCalledTimes(1);

    const [msg, payload] = (log.logWarn as any).mock.calls[0];
    expect(msg).toBe('payment_transition_rejected');
    expect(payload.orderId).toBe('o2');
    expect(payload.from).toBe('failed');
    expect(payload.to).toBe('paid');
    expect(payload.source).toBe('system');
    expect(payload.eventId).toBe('evt_2');
  });

  it('provider=none hard-rejects invalid targets before UPDATE and logs warn', async () => {
    // helper reads current state to log context
    selectQueue = [[{ paymentStatus: 'paid', paymentProvider: 'none' }]];

    const res = await mod.guardedPaymentStatusUpdate({
      orderId: 'o3',
      paymentProvider: 'none',
      to: 'refunded', // explicitly forbidden for provider none
      source: 'system',
      eventId: 'evt_3',
      note: 'test-none',
      set: { updatedAt: new Date() } as any,
    });

    expect(res.applied).toBe(false);
    if (res.applied) throw new Error('expected not applied');
    expect(res.reason).toBe('INVALID_TRANSITION');
    expect(updateMock).not.toHaveBeenCalled();
    expect(log.logWarn).toHaveBeenCalledTimes(1);
  });
});
