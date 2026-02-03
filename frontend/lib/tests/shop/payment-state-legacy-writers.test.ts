import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { eq } from 'drizzle-orm';
import { afterEach,describe, expect, it } from 'vitest';

import { db } from '@/db';
import { orders } from '@/db/schema/shop';
import { guardedPaymentStatusUpdate } from '@/lib/services/orders/payment-state';

type SeedArgs = {
  paymentProvider: 'stripe' | 'none';
  paymentStatus: 'failed' | 'paid';
};

async function seedOrder(args: SeedArgs): Promise<string> {
  const orderId = crypto.randomUUID();
  const now = new Date();

  const idempotencyKey = `test:${orderId}`;

  await db.insert(orders).values({
    id: orderId,
    paymentProvider: args.paymentProvider,
    paymentStatus: args.paymentStatus,

    status: 'INVENTORY_FAILED',
    inventoryStatus: 'released',

    currency: 'USD',
    totalAmountMinor: 1000,
    totalAmount: '10.00',

    idempotencyKey,
    idempotencyRequestHash: crypto
      .createHash('sha256')
      .update(idempotencyKey)
      .digest('hex'),

    stockRestored: true,
    restockedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  return orderId;
}

async function cleanupOrder(orderId: string) {
  await db.delete(orders).where(eq(orders.id, orderId));
}

function walkFiles(dir: string, out: string[]) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(p, out);
    else if (entry.isFile() && p.endsWith('.ts')) out.push(p);
  }
}

describe('Task 5: guarded payment transitions block legacy/forbidden paths', () => {
  const created: string[] = [];

  afterEach(async () => {
    while (created.length) {
      const id = created.pop()!;
      await cleanupOrder(id);
    }
  });

  it('payment-intent path: stripe failed -> requires_payment is INVALID_TRANSITION', async () => {
    const orderId = await seedOrder({
      paymentProvider: 'stripe',
      paymentStatus: 'failed',
    });
    created.push(orderId);

    const res = await guardedPaymentStatusUpdate({
      orderId,
      paymentProvider: 'stripe',
      to: 'requires_payment',
      source: 'payment_intent',
      note: 'legacy-writer-coverage',
    });

    expect(res).toEqual({
      applied: false,
      reason: 'INVALID_TRANSITION',
      from: 'failed',
      currentProvider: 'stripe',
    });
  });

  it('restock path: stripe failed -> paid is INVALID_TRANSITION', async () => {
    const orderId = await seedOrder({
      paymentProvider: 'stripe',
      paymentStatus: 'failed',
    });
    created.push(orderId);

    const res = await guardedPaymentStatusUpdate({
      orderId,
      paymentProvider: 'stripe',
      to: 'paid',
      source: 'system',
      note: 'legacy-writer-coverage',
    });

    expect(res).toEqual({
      applied: false,
      reason: 'INVALID_TRANSITION',
      from: 'failed',
      currentProvider: 'stripe',
    });
  });

  it('provider none: transitions to pending/requires_payment/refunded are INVALID_TRANSITION', async () => {
    const orderId = await seedOrder({
      paymentProvider: 'none',
      paymentStatus: 'failed',
    });
    created.push(orderId);

    for (const to of ['pending', 'requires_payment', 'refunded'] as const) {
      const res = await guardedPaymentStatusUpdate({
        orderId,
        paymentProvider: 'none',
        to,
        source: 'system',
        note: 'legacy-writer-coverage',
      });

      expect(res).toEqual({
        applied: false,
        reason: 'INVALID_TRANSITION',
        from: 'failed',
        currentProvider: 'none',
      });
    }
  });

  it('provider none: failed -> paid is INVALID_TRANSITION', async () => {
    const orderId = await seedOrder({
      paymentProvider: 'none',
      paymentStatus: 'failed',
    });
    created.push(orderId);

    const res = await guardedPaymentStatusUpdate({
      orderId,
      paymentProvider: 'none',
      to: 'paid',
      source: 'system',
      note: 'legacy-writer-coverage',
    });

    expect(res).toEqual({
      applied: false,
      reason: 'INVALID_TRANSITION',
      from: 'failed',
      currentProvider: 'none',
    });
  });

  it('regression: no direct .set({ paymentStatus: ... }) writers in lib/services (except payment-state.ts)', () => {
    const servicesDir = path.join(process.cwd(), 'lib', 'services');
    const files: string[] = [];
    walkFiles(servicesDir, files);

    const offenders: string[] = [];

    for (const f of files) {
      if (f.endsWith(path.join('orders', 'payment-state.ts'))) continue;

      const s = fs.readFileSync(f, 'utf8');
      const hasDirectWriter = /\.set\(\s*{[\s\S]{0,800}?paymentStatus\s*:/.test(
        s
      );
      if (hasDirectWriter) offenders.push(path.relative(process.cwd(), f));
    }

    expect(offenders).toEqual([]);
  });
});
