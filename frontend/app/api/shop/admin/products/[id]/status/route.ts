import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  AdminApiDisabledError,
  AdminForbiddenError,
  AdminUnauthorizedError,
  requireAdminApi,
} from '@/lib/auth/admin';

import { logError } from '@/lib/logging';
import { toggleProductStatus } from '@/lib/services/products';

const productIdParamSchema = z.object({ id: z.string().uuid() });

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminApi(request);

    const rawParams = await context.params;
    const parsedParams = productIdParamSchema.safeParse(rawParams);
    if (!parsedParams.success) {
      return NextResponse.json(
        {
          error: 'Invalid product id',
          code: 'INVALID_PRODUCT_ID',
          details: parsedParams.error.format(),
        },
        { status: 400 }
      );
    }

    const productId = parsedParams.data.id;

    const updated = await toggleProductStatus(productId);
    return NextResponse.json({ success: true, product: updated });
  } catch (error) {
    if (error instanceof AdminApiDisabledError) {
      return NextResponse.json({ code: error.code }, { status: 403 });
    }
    if (error instanceof AdminUnauthorizedError) {
      return NextResponse.json({ code: error.code }, { status: 401 });
    }
    if (error instanceof AdminForbiddenError) {
      return NextResponse.json({ code: error.code }, { status: 403 });
    }

    logError('Failed to update product status', error);
    if (error instanceof Error && error.message === 'PRODUCT_NOT_FOUND') {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }
    return NextResponse.json(
      { error: 'Failed to update product status' },
      { status: 500 }
    );
  }
}
