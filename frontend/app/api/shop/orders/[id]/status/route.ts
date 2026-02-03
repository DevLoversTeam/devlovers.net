import 'server-only';

import crypto from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { orders } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { logError, logWarn } from '@/lib/logging';
import { OrderNotFoundError, OrderStateInvalidError } from '@/lib/services/errors';
import { getOrderSummary } from '@/lib/services/orders/summary';
import { verifyStatusToken } from '@/lib/shop/status-token';
import { orderIdParamSchema } from '@/lib/validation/shop';

export const dynamic = 'force-dynamic';

function noStoreJson(body: unknown, init?: { status?: number }) {
  const res = NextResponse.json(body, { status: init?.status ?? 200 });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const startedAtMs = Date.now();
  const requestId =
    request.headers.get('x-request-id')?.trim() || crypto.randomUUID();

  const baseMeta = {
    requestId,
    route: request.nextUrl.pathname,
    method: request.method,
  };

  const rawParams = await context.params;
  const parsed = orderIdParamSchema.safeParse(rawParams);
  if (!parsed.success) {
    logWarn('order_status_invalid_order_id', {
      ...baseMeta,
      code: 'INVALID_ORDER_ID',
      issuesCount: parsed.error.issues?.length ?? 0,
      durationMs: Date.now() - startedAtMs,
    });
    return noStoreJson(
      { code: 'INVALID_ORDER_ID', error: 'Invalid order id' },
      { status: 400 }
    );
  }

  const orderId = parsed.data.id;
  const statusToken = request.nextUrl.searchParams.get('statusToken');

  try {
    const user = await getCurrentUser();
    let authorized = false;

    if (user) {
      const isAdmin = user.role === 'admin';
      if (isAdmin) {
        authorized = true;
      } else {
        const [row] = await db
          .select({ id: orders.id })
          .from(orders)
          .where(and(eq(orders.id, orderId), eq(orders.userId, user.id)))
          .limit(1);
        if (row) authorized = true;
      }
    }

    if (!authorized) {
      if (!statusToken || !statusToken.trim()) {
        const status = user ? 403 : 401;
        const code = user ? 'FORBIDDEN' : 'STATUS_TOKEN_REQUIRED';
        return noStoreJson({ code }, { status });
      }

      const tokenResult = verifyStatusToken({
        token: statusToken,
        orderId,
      });
      if (!tokenResult.ok) {
        return noStoreJson({ code: 'STATUS_TOKEN_INVALID' }, { status: 403 });
      }
    }

    const order = await getOrderSummary(orderId);
    return noStoreJson({ success: true, order }, { status: 200 });
  } catch (error) {
    if (error instanceof OrderNotFoundError) {
      logWarn('order_status_not_found', {
        ...baseMeta,
        code: 'ORDER_NOT_FOUND',
        orderId,
        durationMs: Date.now() - startedAtMs,
      });
      return noStoreJson({ code: 'ORDER_NOT_FOUND' }, { status: 404 });
    }

    if (error instanceof OrderStateInvalidError) {
      logError('order_status_state_invalid', error, {
        ...baseMeta,
        code: error.code,
        orderId,
        durationMs: Date.now() - startedAtMs,
      });
      return noStoreJson({ code: error.code }, { status: 500 });
    }

    logError('order_status_failed', error, {
      ...baseMeta,
      code: 'ORDER_STATUS_FAILED',
      orderId,
      durationMs: Date.now() - startedAtMs,
    });

    return noStoreJson(
      { code: 'INTERNAL_ERROR', error: 'internal_error' },
      { status: 500 }
    );
  }
}
