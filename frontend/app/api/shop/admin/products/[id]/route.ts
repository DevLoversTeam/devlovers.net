import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import {
  AdminApiDisabledError,
  AdminForbiddenError,
  AdminUnauthorizedError,
  requireAdminApi,
} from '@/lib/auth/admin';

import { parseAdminProductForm } from '@/lib/admin/parseAdminProductForm';
import { logError } from '@/lib/logging';
import { InvalidPayloadError, SlugConflictError } from '@/lib/services/errors';
import {
  deleteProduct,
  getAdminProductByIdWithPrices,
  updateProduct,
} from '@/lib/services/products';

const productIdParamSchema = z.object({ id: z.string().uuid() });
type SaleRuleViolation = {
  currency: string;
  field: 'originalPriceMinor';
  rule: 'required' | 'greater_than_price';
};

function findSaleRuleViolation(input: any): SaleRuleViolation | null {
  const badge = input?.badge;
  if (badge !== 'SALE') return null;

  const prices = Array.isArray(input?.prices) ? input.prices : [];
  for (const row of prices) {
    const currency = String(row?.currency ?? '');
    const priceMinor = Number(row?.priceMinor);
    const originalPriceMinor =
      row?.originalPriceMinor == null ? null : Number(row.originalPriceMinor);

    if (!currency || !Number.isFinite(priceMinor)) continue;

    if (originalPriceMinor == null) {
      return { currency, field: 'originalPriceMinor', rule: 'required' };
    }
    if (
      !Number.isFinite(originalPriceMinor) ||
      originalPriceMinor <= priceMinor
    ) {
      return {
        currency,
        field: 'originalPriceMinor',
        rule: 'greater_than_price',
      };
    }
  }

  return null;
}
function getSaleViolationFromFormData(
  formData: FormData
): SaleRuleViolation | null {
  const badge = String(formData.get('badge') ?? '');
  if (badge !== 'SALE') return null;

  const pricesRaw = formData.get('prices');
  if (typeof pricesRaw !== 'string' || !pricesRaw.trim()) return null;

  try {
    const prices = JSON.parse(pricesRaw);
    return findSaleRuleViolation({ badge, prices });
  } catch {
    return null;
  }
}
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    await requireAdminApi(request);
    const rawParams = await context.params;
    const parsedParams = productIdParamSchema.safeParse(rawParams);

    if (!parsedParams.success) {
      return NextResponse.json(
        { error: 'Invalid product id', details: parsedParams.error.format() },
        { status: 400 }
      );
    }

    const product = await getAdminProductByIdWithPrices(parsedParams.data.id);
    return NextResponse.json({ product });
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

    logError('Failed to load admin product', error);

    if (error instanceof Error && error.message === 'PRODUCT_NOT_FOUND') {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    return NextResponse.json(
      { error: 'Failed to load product' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    await requireAdminApi(request);

    const rawParams = await context.params;
    const parsedParams = productIdParamSchema.safeParse(rawParams);

    if (!parsedParams.success) {
      return NextResponse.json(
        { error: 'Invalid product id', details: parsedParams.error.format() },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    // PATCH inside PATCH() right after: const formData = await request.formData();
    const saleViolationFromForm = getSaleViolationFromFormData(formData);
    if (saleViolationFromForm) {
      const message =
        saleViolationFromForm.rule === 'required'
          ? 'SALE badge requires original price for each provided currency.'
          : 'SALE badge requires original price to be greater than price.';

      return NextResponse.json(
        {
          error: message,
          code: 'SALE_ORIGINAL_REQUIRED',
          field: 'prices',
          details: saleViolationFromForm,
        },
        { status: 400 }
      );
    }

    // 1) Parse/validate base fields via existing parser
    const parsed = parseAdminProductForm(formData, { mode: 'update' });
    if (!parsed.ok) {
      return NextResponse.json(
        { error: 'Invalid product data', details: parsed.error.format() },
        { status: 400 }
      );
    }
    const saleViolation = findSaleRuleViolation(parsed.data as any);
    if (saleViolation) {
      const message =
        saleViolation.rule === 'required'
          ? 'SALE badge requires original price for each provided currency.'
          : 'SALE badge requires original price to be greater than price.';

      return NextResponse.json(
        {
          error: message,
          code: 'SALE_ORIGINAL_REQUIRED',
          field: 'prices',
          details: saleViolation,
        },
        { status: 400 }
      );
    }

    // 3) Update product
    try {
      const imageFile = formData.get('image');

      const updated = await updateProduct(parsedParams.data.id, {
        ...(parsed.data as any),
        image:
          imageFile instanceof File && imageFile.size > 0
            ? imageFile
            : undefined,
      });

      return NextResponse.json({ success: true, product: updated });
    } catch (error) {
      logError('Failed to update product', error);

      if (error instanceof InvalidPayloadError) {
        const anyErr = error as any;
        return NextResponse.json(
          {
            error: error.message || 'Invalid product data',
            code: anyErr.code,
            field: anyErr.field,
            details: anyErr.details,
          },
          { status: 400 }
        );
      }

      if (error instanceof SlugConflictError) {
        return NextResponse.json(
          { error: 'Slug already exists.', code: error.code, field: 'slug' },
          { status: 409 }
        );
      }

      if (error instanceof Error && error.message === 'PRODUCT_NOT_FOUND') {
        return NextResponse.json(
          { error: 'Product not found' },
          { status: 404 }
        );
      }

      if (
        error instanceof Error &&
        error.message === 'Failed to upload image to Cloudinary'
      ) {
        return NextResponse.json(
          {
            error: 'Failed to upload product image',
            code: 'IMAGE_UPLOAD_FAILED',
            field: 'image',
          },
          { status: 502 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to update product' },
        { status: 500 }
      );
    }
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

    logError('Admin PATCH /products/:id failed (outer)', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    await requireAdminApi(request);
    const rawParams = await context.params;
    const parsedParams = productIdParamSchema.safeParse(rawParams);

    if (!parsedParams.success) {
      return NextResponse.json(
        { error: 'Invalid product id', details: parsedParams.error.format() },
        { status: 400 }
      );
    }

    await deleteProduct(parsedParams.data.id);
    return NextResponse.json({ success: true }, { status: 200 });
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

    logError('Failed to delete product', error);

    if (error instanceof Error && error.message === 'PRODUCT_NOT_FOUND') {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    return NextResponse.json(
      { error: 'Failed to delete product' },
      { status: 500 }
    );
  }
}
