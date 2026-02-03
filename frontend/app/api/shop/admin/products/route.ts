import crypto from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { parseAdminProductForm } from '@/lib/admin/parseAdminProductForm';
import {
  AdminApiDisabledError,
  AdminForbiddenError,
  AdminUnauthorizedError,
  requireAdminApi,
} from '@/lib/auth/admin';
import { logError, logWarn } from '@/lib/logging';
import { requireAdminCsrf } from '@/lib/security/admin-csrf';
import { guardBrowserSameOrigin } from '@/lib/security/origin';
import { InvalidPayloadError, SlugConflictError } from '@/lib/services/errors';
import { createProduct } from '@/lib/services/products';

export const runtime = 'nodejs';
function noStoreJson(body: unknown, init?: { status?: number }) {
  const res = NextResponse.json(body, { status: init?.status ?? 200 });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

type SaleRuleViolation = {
  currency: string;
  field: 'originalPriceMinor';
  rule: 'required' | 'greater_than_price';
};

type InvalidPricesJsonError = {
  code: 'INVALID_PRICES_JSON';
  field: 'prices';
};

function isInvalidPricesJsonError(
  value: SaleRuleViolation | InvalidPricesJsonError | null
): value is InvalidPricesJsonError {
  if (!value || typeof value !== 'object') return false;
  return (value as Record<string, unknown>).code === 'INVALID_PRICES_JSON';
}

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
): SaleRuleViolation | InvalidPricesJsonError | null {
  const badge = String(formData.get('badge') ?? '');
  if (badge !== 'SALE') return null;

  const pricesRaw = formData.get('prices');
  if (typeof pricesRaw !== 'string' || !pricesRaw.trim()) return null;

  try {
    const prices = JSON.parse(pricesRaw);
    return findSaleRuleViolation({ badge, prices });
  } catch {
    return { code: 'INVALID_PRICES_JSON', field: 'prices' };
  }
}

export async function POST(request: NextRequest) {
  const startedAtMs = Date.now();

  const requestId =
    request.headers.get('x-request-id')?.trim() || crypto.randomUUID();

  const blocked = guardBrowserSameOrigin(request);
  if (blocked) {
    logWarn('admin_product_create_origin_blocked', {
      requestId,
      route: request.nextUrl.pathname,
      method: request.method,
      code: 'ORIGIN_BLOCKED',
      durationMs: Date.now() - startedAtMs,
    });
    blocked.headers.set('Cache-Control', 'no-store');
    return blocked;
  }

  const baseMeta = {
    requestId,
    route: request.nextUrl.pathname,
    method: request.method,
  };

  let slugForLog: string | null = null;

  try {
    await requireAdminApi(request);

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (error) {
      logWarn('admin_product_create_invalid_body', {
        ...baseMeta,
        code: 'INVALID_REQUEST_BODY',
        reason: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAtMs,
      });

      return noStoreJson(
        { error: 'Invalid request body', code: 'INVALID_REQUEST_BODY' },
        { status: 400 }
      );
    }

    const rawSlug = formData.get('slug');
    slugForLog =
      typeof rawSlug === 'string' && rawSlug.trim().length > 0
        ? rawSlug.trim()
        : null;

    const csrfRes = requireAdminCsrf(
      request,
      'admin:products:create',
      formData
    );
    if (csrfRes) {
      logWarn('admin_product_create_csrf_rejected', {
        ...baseMeta,
        code: 'CSRF_REJECTED',
        slug: slugForLog,
        durationMs: Date.now() - startedAtMs,
      });
      csrfRes.headers.set('Cache-Control', 'no-store');
      return csrfRes;
    }

    const imageFile = formData.get('image');
    if (!(imageFile instanceof File) || imageFile.size === 0) {
      logWarn('admin_product_create_image_required', {
        ...baseMeta,
        code: 'IMAGE_REQUIRED',
        slug: slugForLog,
        durationMs: Date.now() - startedAtMs,
      });

      return noStoreJson(
        {
          error: 'Image file is required',
          code: 'IMAGE_REQUIRED',
          field: 'image',
        },
        { status: 400 }
      );
    }

    const saleViolationFromForm = getSaleViolationFromFormData(formData);
    if (isInvalidPricesJsonError(saleViolationFromForm)) {
      logWarn('admin_product_create_invalid_prices_json', {
        ...baseMeta,
        code: 'INVALID_PRICES_JSON',
        slug: slugForLog,
        durationMs: Date.now() - startedAtMs,
      });

      return noStoreJson(
        {
          error: 'Invalid prices JSON',
          code: 'INVALID_PRICES_JSON',
          field: 'prices',
        },
        { status: 400 }
      );
    }

    if (saleViolationFromForm) {
      const message =
        saleViolationFromForm.rule === 'required'
          ? 'SALE badge requires original price for each provided currency.'
          : 'SALE badge requires original price to be greater than price.';

      logWarn('admin_product_create_sale_rule_violation', {
        ...baseMeta,
        code: 'SALE_ORIGINAL_REQUIRED',
        slug: slugForLog,
        currency: saleViolationFromForm.currency,
        rule: saleViolationFromForm.rule,
        durationMs: Date.now() - startedAtMs,
      });

      return noStoreJson(
        {
          error: message,
          code: 'SALE_ORIGINAL_REQUIRED',
          field: 'prices',
          details: saleViolationFromForm,
        },
        { status: 400 }
      );
    }

    const parsed = parseAdminProductForm(formData, { mode: 'create' });

    if (!parsed.ok) {
      const issuesCount =
        ((parsed.error as any)?.issues?.length as number | undefined) ?? 0;

      logWarn('admin_product_create_invalid_payload', {
        ...baseMeta,
        code: 'INVALID_PAYLOAD',
        slug: slugForLog,
        issuesCount,
        durationMs: Date.now() - startedAtMs,
      });

      return noStoreJson(
        {
          error: 'Invalid product data',
          code: 'INVALID_PAYLOAD',
          details: parsed.error.format(),
        },
        { status: 400 }
      );
    }

    const saleViolation = findSaleRuleViolation(parsed.data as any);
    if (saleViolation) {
      const message =
        saleViolation.rule === 'required'
          ? 'SALE badge requires original price for each provided currency.'
          : 'SALE badge requires original price to be greater than price.';

      const parsedSlug =
        typeof (parsed.data as any)?.slug === 'string' &&
        (parsed.data as any).slug.trim().length > 0
          ? (parsed.data as any).slug.trim()
          : null;

      logWarn('admin_product_create_sale_rule_violation', {
        ...baseMeta,
        code: 'SALE_ORIGINAL_REQUIRED',
        slug: parsedSlug ?? slugForLog,
        currency: saleViolation.currency,
        rule: saleViolation.rule,
        durationMs: Date.now() - startedAtMs,
      });

      return noStoreJson(
        {
          error: message,
          code: 'SALE_ORIGINAL_REQUIRED',
          field: 'prices',
          details: saleViolation,
        },
        { status: 400 }
      );
    }

    try {
      const inserted = await createProduct({
        ...parsed.data,
        image: imageFile,
      });
      return noStoreJson(
        {
          success: true,
          product: inserted,
        },
        { status: 201 }
      );
    } catch (error) {
      const parsedSlug =
        typeof (parsed.data as any)?.slug === 'string' &&
        (parsed.data as any).slug.trim().length > 0
          ? (parsed.data as any).slug.trim()
          : null;

      const errCode =
        error instanceof InvalidPayloadError
          ? ((error as any).code ?? 'INVALID_PAYLOAD')
          : error instanceof SlugConflictError
            ? error.code
            : error instanceof Error &&
                error.message === 'Failed to upload image to Cloudinary'
              ? 'IMAGE_UPLOAD_FAILED'
              : 'ADMIN_PRODUCT_CREATE_FAILED';

      const isExpected =
        error instanceof InvalidPayloadError ||
        error instanceof SlugConflictError ||
        (error instanceof Error &&
          error.message === 'Failed to upload image to Cloudinary');

      if (isExpected) {
        logWarn('admin_product_create_failed', {
          ...baseMeta,
          code: errCode,
          slug: parsedSlug ?? slugForLog,
          reason: error instanceof Error ? error.message : String(error),
          durationMs: Date.now() - startedAtMs,
        });
      } else {
        logError('admin_product_create_failed', error, {
          ...baseMeta,
          code: errCode,
          slug: parsedSlug ?? slugForLog,
          durationMs: Date.now() - startedAtMs,
        });
      }

      if (error instanceof InvalidPayloadError) {
        const anyErr = error as any;
        return noStoreJson(
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
        return noStoreJson(
          { error: 'Slug already exists.', code: error.code, field: 'slug' },
          { status: 409 }
        );
      }

      if (
        error instanceof Error &&
        error.message === 'Failed to upload image to Cloudinary'
      ) {
        return noStoreJson(
          {
            error: 'Failed to upload product image',
            code: 'IMAGE_UPLOAD_FAILED',
            field: 'image',
          },
          { status: 502 }
        );
      }

      return noStoreJson(
        { error: 'Failed to create product', code: 'INTERNAL_ERROR' },
        { status: 500 }
      );
    }
  } catch (error) {
    if (error instanceof AdminApiDisabledError) {
      logWarn('admin_product_create_admin_api_disabled', {
        ...baseMeta,
        code: error.code,
        slug: slugForLog,
        durationMs: Date.now() - startedAtMs,
      });
      return noStoreJson({ code: error.code }, { status: 403 });
    }
    if (error instanceof AdminUnauthorizedError) {
      logWarn('admin_product_create_unauthorized', {
        ...baseMeta,
        code: error.code,
        slug: slugForLog,
        durationMs: Date.now() - startedAtMs,
      });
      return noStoreJson({ code: error.code }, { status: 401 });
    }
    if (error instanceof AdminForbiddenError) {
      logWarn('admin_product_create_forbidden', {
        ...baseMeta,
        code: error.code,
        slug: slugForLog,
        durationMs: Date.now() - startedAtMs,
      });
      return noStoreJson({ code: error.code }, { status: 403 });
    }

    logError('admin_product_create_outer_failed', error, {
      ...baseMeta,
      code: 'ADMIN_PRODUCT_CREATE_OUTER_FAILED',
      slug: slugForLog,
      durationMs: Date.now() - startedAtMs,
    });

    return noStoreJson(
      { error: 'internal_error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
