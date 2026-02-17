import 'server-only';

import crypto from 'node:crypto';

import { desc, eq, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { orderItems, orders } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { logError, logWarn } from '@/lib/logging';

export const dynamic = 'force-dynamic';

function noStoreJson(body: unknown, init?: { status?: number }) {
  const res = NextResponse.json(body, { status: init?.status ?? 200 });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

type PaymentStatus = (typeof orders.$inferSelect)['paymentStatus'];
type OrderCurrency = (typeof orders.$inferSelect)['currency'];

function toCount(v: unknown): number {
  let n = 0;

  if (typeof v === 'number') n = v;
  else if (typeof v === 'bigint') n = Number(v);
  else if (typeof v === 'string') n = Number(v);

  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}

export async function GET(request: NextRequest) {
  const startedAtMs = Date.now();
  const requestId =
    request.headers.get('x-request-id')?.trim() || crypto.randomUUID();

  const baseMeta = {
    requestId,
    route: request.nextUrl.pathname,
    method: request.method,
  };

  try {
    const user = await getCurrentUser();
    if (!user) {
      logWarn('public_orders_list_unauthorized', {
        ...baseMeta,
        code: 'UNAUTHORIZED',
        durationMs: Date.now() - startedAtMs,
      });

      return noStoreJson(
        { code: 'UNAUTHORIZED', error: 'Authentication required' },
        { status: 401 }
      );
    }

    const rows = await db
      .select({
        id: orders.id,
        totalAmount: orders.totalAmount,
        currency: orders.currency,
        paymentStatus: orders.paymentStatus,
        createdAt: orders.createdAt,

        primaryItemLabel: sql<string | null>`
          (
            array_agg(
              coalesce(
                nullif(trim(${orderItems.productTitle}), ''),
                nullif(trim(${orderItems.productSlug}), ''),
                nullif(trim(${orderItems.productSku}), '')
              )
              order by ${orderItems.id}
            )
            filter (
              where coalesce(
                nullif(trim(${orderItems.productTitle}), ''),
                nullif(trim(${orderItems.productSlug}), ''),
                nullif(trim(${orderItems.productSku}), '')
              ) is not null
            )
          )[1]
        `,
        itemCount: sql`count(${orderItems.id})`,
      })
      .from(orders)
      .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
      .where(eq(orders.userId, user.id))
      .groupBy(
        orders.id,
        orders.totalAmount,
        orders.currency,
        orders.paymentStatus,
        orders.createdAt
      )
      .orderBy(desc(orders.createdAt))
      .limit(50);

    const response = rows.map(r => ({
      id: String(r.id),
      totalAmount: String(r.totalAmount),
      currency: r.currency as OrderCurrency,
      paymentStatus: r.paymentStatus as PaymentStatus,
      createdAt: r.createdAt.toISOString(),
      primaryItemLabel: r.primaryItemLabel ?? null,
      itemCount: toCount(r.itemCount),
    }));

    return noStoreJson({ success: true, orders: response }, { status: 200 });
  } catch (error) {
    logError('public_orders_list_failed', error, {
      ...baseMeta,
      code: 'PUBLIC_ORDERS_LIST_FAILED',
      durationMs: Date.now() - startedAtMs,
    });

    return noStoreJson(
      { code: 'INTERNAL_ERROR', error: 'internal_error' },
      { status: 500 }
    );
  }
}
