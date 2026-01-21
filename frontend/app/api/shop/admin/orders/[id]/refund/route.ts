import { NextRequest, NextResponse } from 'next/server';

import {
  AdminApiDisabledError,
  AdminForbiddenError,
  AdminUnauthorizedError,
  requireAdminApi,
} from '@/lib/auth/admin';
import { requireAdminCsrf } from '@/lib/security/admin-csrf';

import { logError } from '@/lib/logging';
import { OrderNotFoundError, InvalidPayloadError } from '@/lib/services/errors';
import { refundOrder } from '@/lib/services/orders';
import { orderIdParamSchema, orderSummarySchema } from '@/lib/validation/shop';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminApi(request);
    const csrfRes = requireAdminCsrf(request, 'admin:orders:refund');
    if (csrfRes) return csrfRes;

    const rawParams = await context.params;
    const parsed = orderIdParamSchema.safeParse(rawParams);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid order id', code: 'INVALID_ORDER_ID' },
        { status: 400 }
      );
    }

    // app/api/shop/admin/orders/[id]/refund/route.ts
    const order = await refundOrder(parsed.data.id, { requestedBy: 'admin' });

    const orderSummary = orderSummarySchema.parse(order);

    return NextResponse.json({
      success: true,
      order: {
        ...orderSummary,
        createdAt: orderSummary.createdAt.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof AdminApiDisabledError) {
      return NextResponse.json({ code: 'ADMIN_API_DISABLED' }, { status: 403 });
    }
    if (error instanceof AdminUnauthorizedError) {
      return NextResponse.json({ code: error.code }, { status: 401 });
    }
    if (error instanceof AdminForbiddenError) {
      return NextResponse.json({ code: error.code }, { status: 403 });
    }

    logError('Refund order failed', error);

    if (error instanceof OrderNotFoundError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 404 }
      );
    }

    if (error instanceof InvalidPayloadError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Unable to refund order', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
