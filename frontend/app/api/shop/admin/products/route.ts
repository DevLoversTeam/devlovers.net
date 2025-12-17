import { NextRequest, NextResponse } from 'next/server';

import {
  AdminApiDisabledError,
  AdminForbiddenError,
  AdminUnauthorizedError,
  requireAdminApi,
} from '@/lib/auth/admin';

import { parseAdminProductForm } from '@/lib/admin/parseAdminProductForm';
import { logError } from '@/lib/logging';
import { InvalidPayloadError, SlugConflictError } from '@/lib/services/errors';
import { createProduct } from '@/lib/services/products';

export async function POST(request: NextRequest) {
  try {
    await requireAdminApi(request);

    const formData = await request.formData();
    const imageFile = formData.get('image');
    if (!(imageFile instanceof File) || imageFile.size === 0) {
      return NextResponse.json(
        {
          error: 'Image file is required',
          code: 'IMAGE_REQUIRED',
          field: 'image',
        },
        { status: 400 }
      );
    }

    const parsed = parseAdminProductForm(formData, { mode: 'create' });

    if (!parsed.ok) {
      return NextResponse.json(
        { error: 'Invalid product data', details: parsed.error.format() },
        { status: 400 }
      );
    }

    try {
      const inserted = await createProduct({
        ...parsed.data,
        image: imageFile,
      });
      return NextResponse.json(
        {
          success: true,
          product: inserted,
        },
        { status: 201 }
      );
    } catch (error) {
      logError('Failed to create product', error);

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
        { error: 'Failed to create product' },
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
    throw error;
  }
}
