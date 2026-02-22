import 'server-only';

import crypto from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { orders } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { logError, logWarn } from '@/lib/logging';
import {
  OrderNotFoundError,
  OrderStateInvalidError,
} from '@/lib/services/errors';
import {
  getOrderAttemptSummary,
  getOrderSummary,
} from '@/lib/services/orders/summary';
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

  const rawParams = await context.params;
  const parsed = orderIdParamSchema.safeParse(rawParams);
  if (!parsed.success) {
    logWarn('order_status_invalid_order_id', {
      requestId,
      code: 'INVALID_ORDER_ID',
      orderId: null,
      durationMs: Date.now() - startedAtMs,
    });
    return noStoreJson({ code: 'INVALID_ORDER_ID' }, { status: 400 });
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
        logWarn('order_status_access_denied', {
          requestId,
          orderId,
          code,
          durationMs: Date.now() - startedAtMs,
        });
        return noStoreJson({ code }, { status });
      }

      const tokenResult = verifyStatusToken({
        token: statusToken,
        orderId,
      });
      if (!tokenResult.ok) {
        if (tokenResult.reason === 'missing_secret') {
          logError(
            'order_status_token_misconfigured',
            new Error('SHOP_STATUS_TOKEN_SECRET is not configured'),
            {
              requestId,
              orderId,
              code: 'STATUS_TOKEN_MISCONFIGURED',
              durationMs: Date.now() - startedAtMs,
            }
          );
          return noStoreJson(
            { code: 'STATUS_TOKEN_MISCONFIGURED' },
            { status: 500 }
          );
        }

        logWarn('order_status_token_invalid', {
          requestId,
          orderId,
          code: 'STATUS_TOKEN_INVALID',
          durationMs: Date.now() - startedAtMs,
        });
        return noStoreJson({ code: 'STATUS_TOKEN_INVALID' }, { status: 403 });
      }
    }

    const order = await getOrderSummary(orderId);
    const attempt = await getOrderAttemptSummary(orderId);
    return noStoreJson({ success: true, order, attempt }, { status: 200 });
  } catch (error) {
    if (error instanceof OrderNotFoundError) {
      logWarn('order_status_not_found', {
        requestId,
        code: 'ORDER_NOT_FOUND',
        orderId,
        durationMs: Date.now() - startedAtMs,
      });
      return noStoreJson({ code: 'ORDER_NOT_FOUND' }, { status: 404 });
    }

    if (error instanceof OrderStateInvalidError) {
      logError('order_status_state_invalid', error, {
        requestId,
        code: 'INTERNAL_ERROR',
        orderId,
        durationMs: Date.now() - startedAtMs,
      });
      return noStoreJson({ code: 'INTERNAL_ERROR' }, { status: 500 });
    }

    logError('order_status_failed', error, {
      requestId,
      code: 'ORDER_STATUS_FAILED',
      orderId,
      durationMs: Date.now() - startedAtMs,
    });

    return noStoreJson({ code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
