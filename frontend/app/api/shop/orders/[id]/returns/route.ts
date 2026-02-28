import crypto from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { orders } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { logError, logWarn } from '@/lib/logging';
import { guardBrowserSameOrigin } from '@/lib/security/origin';
import { InvalidPayloadError } from '@/lib/services/errors';
import { createReturnRequest, listOrderReturns } from '@/lib/services/shop/returns';
import { orderIdParamSchema } from '@/lib/validation/shop';
import { createReturnPayloadSchema } from '@/lib/validation/shop-returns';

function noStoreJson(body: unknown, status = 200) {
  const res = NextResponse.json(body, { status });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

function mapInvalidPayloadStatus(code: string): number {
  if (code === 'RETURN_NOT_FOUND') return 404;
  if (code === 'RETURN_ALREADY_EXISTS') return 409;
  if (code === 'PSP_UNAVAILABLE') return 503;
  return 400;
}

async function assertOwnerOrderAccess(args: {
  orderId: string;
  userId: string;
}): Promise<boolean> {
  const [owned] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.id, args.orderId), eq(orders.userId, args.userId)))
    .limit(1);
  return !!owned;
}

async function assertAdminOrOwnerAccess(args: {
  orderId: string;
  userId: string;
  role: string | null | undefined;
}): Promise<boolean> {
  if (args.role === 'admin') {
    const [exists] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.id, args.orderId))
      .limit(1);
    return !!exists;
  }
  return assertOwnerOrderAccess({ orderId: args.orderId, userId: args.userId });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const requestId =
    request.headers.get('x-request-id')?.trim() || crypto.randomUUID();
  const baseMeta = {
    requestId,
    route: request.nextUrl.pathname,
    method: request.method,
  };

  const blocked = guardBrowserSameOrigin(request);
  if (blocked) {
    blocked.headers.set('Cache-Control', 'no-store');
    return blocked;
  }

  const user = await getCurrentUser();
  if (!user) {
    return noStoreJson({ code: 'UNAUTHORIZED' }, 401);
  }
  if (user.role === 'admin') {
    return noStoreJson({ code: 'FORBIDDEN' }, 403);
  }

  const parsedParams = orderIdParamSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return noStoreJson({ code: 'INVALID_ORDER_ID' }, 400);
  }
  const orderId = parsedParams.data.id;

  const ownsOrder = await assertOwnerOrderAccess({ orderId, userId: user.id });
  if (!ownsOrder) {
    return noStoreJson({ code: 'ORDER_NOT_FOUND' }, 404);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noStoreJson(
      { code: 'INVALID_PAYLOAD', message: 'Invalid JSON body.' },
      400
    );
  }

  const parsedPayload = createReturnPayloadSchema.safeParse(body);
  if (!parsedPayload.success) {
    return noStoreJson(
      { code: 'INVALID_PAYLOAD', message: 'Invalid payload.' },
      400
    );
  }

  if (parsedPayload.data.resolution === 'exchange') {
    logWarn('order_returns_exchange_not_supported', {
      ...baseMeta,
      orderId,
      code: 'EXCHANGES_NOT_SUPPORTED',
    });
    return noStoreJson(
      {
        code: 'EXCHANGES_NOT_SUPPORTED',
        message: 'Exchanges are not supported. Please create a return refund request.',
      },
      422
    );
  }

  try {
    const result = await createReturnRequest({
      orderId,
      actorUserId: user.id,
      idempotencyKey: parsedPayload.data.idempotencyKey,
      reason: parsedPayload.data.reason ?? null,
      policyRestock: parsedPayload.data.policyRestock,
      requestId,
    });

    return noStoreJson(
      {
        success: true,
        created: result.created,
        returnRequest: {
          ...result.request,
          approvedAt: result.request.approvedAt?.toISOString() ?? null,
          rejectedAt: result.request.rejectedAt?.toISOString() ?? null,
          receivedAt: result.request.receivedAt?.toISOString() ?? null,
          refundedAt: result.request.refundedAt?.toISOString() ?? null,
          createdAt: result.request.createdAt.toISOString(),
          updatedAt: result.request.updatedAt.toISOString(),
          items: result.request.items.map(item => ({
            ...item,
            createdAt: item.createdAt.toISOString(),
          })),
        },
      },
      result.created ? 201 : 200
    );
  } catch (error) {
    if (error instanceof InvalidPayloadError) {
      logWarn('order_returns_create_rejected', {
        ...baseMeta,
        orderId,
        code: error.code,
      });
      return noStoreJson(
        {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
        mapInvalidPayloadStatus(error.code)
      );
    }

    logError('order_returns_create_failed', error, {
      ...baseMeta,
      orderId,
      code: 'ORDER_RETURNS_CREATE_FAILED',
    });
    return noStoreJson(
      { code: 'INTERNAL_ERROR', message: 'Unable to create return request.' },
      500
    );
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const requestId =
    request.headers.get('x-request-id')?.trim() || crypto.randomUUID();
  const baseMeta = {
    requestId,
    route: request.nextUrl.pathname,
    method: request.method,
  };

  const user = await getCurrentUser();
  if (!user) {
    return noStoreJson({ code: 'UNAUTHORIZED' }, 401);
  }

  const parsedParams = orderIdParamSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return noStoreJson({ code: 'INVALID_ORDER_ID' }, 400);
  }
  const orderId = parsedParams.data.id;

  const allowed = await assertAdminOrOwnerAccess({
    orderId,
    userId: user.id,
    role: user.role,
  });
  if (!allowed) {
    return noStoreJson({ code: 'ORDER_NOT_FOUND' }, 404);
  }

  try {
    const rows = await listOrderReturns(orderId);
    return noStoreJson({
      success: true,
      returns: rows.map(row => ({
        ...row,
        approvedAt: row.approvedAt?.toISOString() ?? null,
        rejectedAt: row.rejectedAt?.toISOString() ?? null,
        receivedAt: row.receivedAt?.toISOString() ?? null,
        refundedAt: row.refundedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        items: row.items.map(item => ({
          ...item,
          createdAt: item.createdAt.toISOString(),
        })),
      })),
    });
  } catch (error) {
    logError('order_returns_list_failed', error, {
      ...baseMeta,
      orderId,
      code: 'ORDER_RETURNS_LIST_FAILED',
    });
    return noStoreJson(
      { code: 'INTERNAL_ERROR', message: 'Unable to load returns.' },
      500
    );
  }
}
