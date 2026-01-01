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

// const adminCurrencySchema = z
//   .string()
//   .transform(v => v.trim().toUpperCase())
//   .pipe(z.enum(['USD', 'UAH']));

// function parseMajorToMinor(value: string | number): number {
//   const s = String(value).trim().replace(',', '.');

//   if (!/^\d+(\.\d{1,2})?$/.test(s)) {
//     throw new Error(`Invalid money value: "${value}"`);
//   }
//   const [whole, frac = ''] = s.split('.');
//   const frac2 = (frac + '00').slice(0, 2);
//   const minor = Number(whole) * 100 + Number(frac2);
//   if (!Number.isSafeInteger(minor) || minor < 0) {
//     throw new Error(`Invalid money value: "${value}"`);
//   }
//   return minor;
// }

// const minorRowSchema = z.object({
//   currency: adminCurrencySchema,
//   priceMinor: z.preprocess(
//     v => (typeof v === 'string' ? Number(v) : v),
//     z.number().int().nonnegative()
//   ),
//   originalPriceMinor: z.preprocess(v => {
//     if (v === undefined) return undefined;
//     if (v === null) return null;
//     return typeof v === 'string' ? Number(v) : v;
//   }, z.number().int().nonnegative().nullable().optional()),
// });

// const legacyRowSchema = z.object({
//   currency: adminCurrencySchema,
//   price: z.preprocess(v => String(v).trim(), z.string().min(1)),
//   originalPrice: z.preprocess(v => {
//     if (v === undefined) return undefined;
//     if (v === null) return null;
//     const s = String(v).trim();
//     return s.length ? s : null;
//   }, z.string().nullable().optional()),
// });

// const adminPriceRowSchema = z
//   .union([minorRowSchema, legacyRowSchema])
//   .transform(row => {
//     if ('priceMinor' in row) {
//       return row;
//     }
//     return {
//       currency: row.currency,
//       priceMinor: parseMajorToMinor(row.price),
//       originalPriceMinor:
//         row.originalPrice == null ? null : parseMajorToMinor(row.originalPrice),
//     };
//   });

// const adminPricesSchema = z.array(adminPriceRowSchema);

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

    // 1) Parse/validate base fields via existing parser
    const parsed = parseAdminProductForm(formData, { mode: 'update' });
    if (!parsed.ok) {
      return NextResponse.json(
        { error: 'Invalid product data', details: parsed.error.format() },
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
        return NextResponse.json(
          { error: error.message || 'Invalid product data', code: error.code },
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
