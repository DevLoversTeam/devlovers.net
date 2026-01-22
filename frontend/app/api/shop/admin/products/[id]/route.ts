import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import {
  AdminApiDisabledError,
  AdminForbiddenError,
  AdminUnauthorizedError,
  requireAdminApi,
} from '@/lib/auth/admin';

import {
  InvalidPayloadError,
  SlugConflictError,
  PriceConfigError,
} from '@/lib/services/errors';

import { requireAdminCsrf } from '@/lib/security/admin-csrf';
import { guardBrowserSameOrigin } from '@/lib/security/origin';

import { parseAdminProductForm } from '@/lib/admin/parseAdminProductForm';
import { logError, logWarn } from '@/lib/logging';

import {
  deleteProduct,
  getAdminProductByIdWithPrices,
  updateProduct,
} from '@/lib/services/products';

export const runtime = 'nodejs';

function noStoreJson(body: unknown, init?: { status?: number }) {
  const res = NextResponse.json(body, { status: init?.status ?? 200 });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

const productIdParamSchema = z.object({ id: z.string().uuid() });

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

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const startedAtMs = Date.now();

  const requestId =
    request.headers.get('x-request-id')?.trim() || crypto.randomUUID();

  const blocked = guardBrowserSameOrigin(request);
  if (blocked) {
    logWarn('admin_product_detail_origin_blocked', {
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

  let productIdForLog: string | null = null;

  try {
    await requireAdminApi(request);

    const csrfRes = requireAdminCsrf(request, 'admin:products:read');
    if (csrfRes) {
      logWarn('admin_product_detail_csrf_rejected', {
        ...baseMeta,
        code: 'CSRF_REJECTED',
        productId: productIdForLog,
        durationMs: Date.now() - startedAtMs,
      });
      csrfRes.headers.set('Cache-Control', 'no-store');
      return csrfRes;
    }

    const rawParams = await context.params;
    const parsedParams = productIdParamSchema.safeParse(rawParams);

    if (!parsedParams.success) {
      logWarn('admin_product_detail_invalid_product_id', {
        ...baseMeta,
        code: 'INVALID_PRODUCT_ID',
        issuesCount: parsedParams.error.issues?.length ?? 0,
        durationMs: Date.now() - startedAtMs,
      });

      return noStoreJson(
        {
          error: 'Invalid product id',
          code: 'INVALID_PRODUCT_ID',
          details: parsedParams.error.format(),
        },
        { status: 400 }
      );
    }

    productIdForLog = parsedParams.data.id;

    const product = await getAdminProductByIdWithPrices(productIdForLog);

    return noStoreJson({ product }, { status: 200 });
  } catch (error) {
    if (error instanceof AdminApiDisabledError) {
      logWarn('admin_product_detail_admin_api_disabled', {
        ...baseMeta,
        code: error.code,
        productId: productIdForLog,
        durationMs: Date.now() - startedAtMs,
      });
      return noStoreJson({ code: error.code }, { status: 403 });
    }

    if (error instanceof AdminUnauthorizedError) {
      logWarn('admin_product_detail_unauthorized', {
        ...baseMeta,
        code: error.code,
        productId: productIdForLog,
        durationMs: Date.now() - startedAtMs,
      });
      return noStoreJson({ code: error.code }, { status: 401 });
    }

    if (error instanceof AdminForbiddenError) {
      logWarn('admin_product_detail_forbidden', {
        ...baseMeta,
        code: error.code,
        productId: productIdForLog,
        durationMs: Date.now() - startedAtMs,
      });
      return noStoreJson({ code: error.code }, { status: 403 });
    }

    if (error instanceof Error && error.message === 'PRODUCT_NOT_FOUND') {
      logWarn('admin_product_detail_not_found', {
        ...baseMeta,
        code: 'PRODUCT_NOT_FOUND',
        productId: productIdForLog,
        durationMs: Date.now() - startedAtMs,
      });

      return noStoreJson(
        { error: 'Product not found', code: 'PRODUCT_NOT_FOUND' },
        { status: 404 }
      );
    }

    logError('admin_product_detail_failed', error, {
      ...baseMeta,
      code: 'ADMIN_PRODUCT_DETAIL_FAILED',
      productId: productIdForLog,
      durationMs: Date.now() - startedAtMs,
    });

    return noStoreJson(
      { error: 'internal_error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const startedAtMs = Date.now();

  const requestId =
    request.headers.get('x-request-id')?.trim() || crypto.randomUUID();

  const blocked = guardBrowserSameOrigin(request);
  if (blocked) {
    logWarn('admin_product_update_origin_blocked', {
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

  let productIdForLog: string | null = null;

  try {
    await requireAdminApi(request);

    const rawParams = await context.params;
    const parsedParams = productIdParamSchema.safeParse(rawParams);

    if (!parsedParams.success) {
      logWarn('admin_product_update_invalid_product_id', {
        ...baseMeta,
        code: 'INVALID_PRODUCT_ID',
        issuesCount: parsedParams.error.issues?.length ?? 0,
        durationMs: Date.now() - startedAtMs,
      });

      return noStoreJson(
        {
          error: 'Invalid product id',
          code: 'INVALID_PRODUCT_ID',
          details: parsedParams.error.format(),
        },
        { status: 400 }
      );
    }

    productIdForLog = parsedParams.data.id;

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (err) {
      logWarn('admin_product_update_invalid_body', {
        ...baseMeta,
        code: 'INVALID_REQUEST_BODY',
        productId: productIdForLog,
        reason: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startedAtMs,
      });

      return noStoreJson(
        { error: 'Invalid request body', code: 'INVALID_REQUEST_BODY' },
        { status: 400 }
      );
    }

    const csrfRes = requireAdminCsrf(
      request,
      'admin:products:update',
      formData
    );
    if (csrfRes) {
      logWarn('admin_product_update_csrf_rejected', {
        ...baseMeta,
        code: 'CSRF_REJECTED',
        productId: productIdForLog,
        durationMs: Date.now() - startedAtMs,
      });
      csrfRes.headers.set('Cache-Control', 'no-store');
      return csrfRes;
    }

    const saleViolationFromForm = getSaleViolationFromFormData(formData);

    if (isInvalidPricesJsonError(saleViolationFromForm)) {
      logWarn('admin_product_update_invalid_prices_json', {
        ...baseMeta,
        code: 'INVALID_PRICES_JSON',
        productId: productIdForLog,
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

      logWarn('admin_product_update_sale_rule_violation', {
        ...baseMeta,
        code: 'SALE_ORIGINAL_REQUIRED',
        productId: productIdForLog,
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

    const parsed = parseAdminProductForm(formData, { mode: 'update' });
    if (!parsed.ok) {
      const issuesCount =
        ((parsed.error as any)?.issues?.length as number | undefined) ?? 0;

      logWarn('admin_product_update_invalid_payload', {
        ...baseMeta,
        code: 'INVALID_PAYLOAD',
        productId: productIdForLog,
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

      logWarn('admin_product_update_sale_rule_violation', {
        ...baseMeta,
        code: 'SALE_ORIGINAL_REQUIRED',
        productId: productIdForLog,
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
      const imageFile = formData.get('image');

      const updated = await updateProduct(productIdForLog, {
        ...(parsed.data as any),
        image:
          imageFile instanceof File && imageFile.size > 0
            ? imageFile
            : undefined,
      });

      return noStoreJson({ success: true, product: updated }, { status: 200 });
    } catch (error) {
      if (error instanceof PriceConfigError) {
        logWarn('admin_product_update_price_config_error', {
          ...baseMeta,
          code: error.code, // PRICE_CONFIG_ERROR
          productId: productIdForLog,
          currency: error.currency,
          durationMs: Date.now() - startedAtMs,
        });

        return noStoreJson(
          {
            error: error.message,
            code: error.code,
            productId: error.productId,
            currency: error.currency,
            field: 'prices',
          },
          { status: 400 }
        );
      }

      if (error instanceof InvalidPayloadError) {
        const anyErr = error as any;

        logWarn('admin_product_update_invalid_payload_error', {
          ...baseMeta,
          code: anyErr.code ?? 'INVALID_PAYLOAD',
          productId: productIdForLog,
          field: anyErr.field,
          durationMs: Date.now() - startedAtMs,
        });

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
        logWarn('admin_product_update_slug_conflict', {
          ...baseMeta,
          code: error.code,
          productId: productIdForLog,
          durationMs: Date.now() - startedAtMs,
        });

        return noStoreJson(
          { error: 'Slug already exists.', code: error.code, field: 'slug' },
          { status: 409 }
        );
      }

      if (error instanceof Error && error.message === 'PRODUCT_NOT_FOUND') {
        logWarn('admin_product_update_not_found', {
          ...baseMeta,
          code: 'PRODUCT_NOT_FOUND',
          productId: productIdForLog,
          durationMs: Date.now() - startedAtMs,
        });

        return noStoreJson(
          { error: 'Product not found', code: 'PRODUCT_NOT_FOUND' },
          { status: 404 }
        );
      }

      if (
        error instanceof Error &&
        error.message === 'Failed to upload image to Cloudinary'
      ) {
        logWarn('admin_product_update_image_upload_failed', {
          ...baseMeta,
          code: 'IMAGE_UPLOAD_FAILED',
          productId: productIdForLog,
          durationMs: Date.now() - startedAtMs,
        });

        return noStoreJson(
          {
            error: 'Failed to upload product image',
            code: 'IMAGE_UPLOAD_FAILED',
            field: 'image',
          },
          { status: 502 }
        );
      }

      logError('admin_product_update_failed', error, {
        ...baseMeta,
        code: 'ADMIN_PRODUCT_UPDATE_FAILED',
        productId: productIdForLog,
        durationMs: Date.now() - startedAtMs,
      });

      return noStoreJson(
        { error: 'Failed to update product', code: 'INTERNAL_ERROR' },
        { status: 500 }
      );
    }
  } catch (error) {
    if (error instanceof AdminApiDisabledError) {
      logWarn('admin_product_update_admin_api_disabled', {
        ...baseMeta,
        code: error.code,
        productId: productIdForLog,
        durationMs: Date.now() - startedAtMs,
      });
      return noStoreJson({ code: error.code }, { status: 403 });
    }

    if (error instanceof AdminUnauthorizedError) {
      logWarn('admin_product_update_unauthorized', {
        ...baseMeta,
        code: error.code,
        productId: productIdForLog,
        durationMs: Date.now() - startedAtMs,
      });
      return noStoreJson({ code: error.code }, { status: 401 });
    }

    if (error instanceof AdminForbiddenError) {
      logWarn('admin_product_update_forbidden', {
        ...baseMeta,
        code: error.code,
        productId: productIdForLog,
        durationMs: Date.now() - startedAtMs,
      });
      return noStoreJson({ code: error.code }, { status: 403 });
    }

    logError('admin_product_update_outer_failed', error, {
      ...baseMeta,
      code: 'ADMIN_PRODUCT_UPDATE_OUTER_FAILED',
      productId: productIdForLog,
      durationMs: Date.now() - startedAtMs,
    });

    return noStoreJson(
      { error: 'internal_error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const startedAtMs = Date.now();

  const requestId =
    request.headers.get('x-request-id')?.trim() || crypto.randomUUID();

  const blocked = guardBrowserSameOrigin(request);
  if (blocked) {
    logWarn('admin_product_delete_origin_blocked', {
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

  let productIdForLog: string | null = null;

  try {
    await requireAdminApi(request);

    // DELETE can’t reliably carry FormData; CSRF is validated via header/cookie path inside requireAdminCsrf.
    const csrfRes = requireAdminCsrf(request, 'admin:products:delete');
    if (csrfRes) {
      logWarn('admin_product_delete_csrf_rejected', {
        ...baseMeta,
        code: 'CSRF_REJECTED',
        productId: productIdForLog,
        durationMs: Date.now() - startedAtMs,
      });
      csrfRes.headers.set('Cache-Control', 'no-store');
      return csrfRes;
    }

    const rawParams = await context.params;
    const parsedParams = productIdParamSchema.safeParse(rawParams);

    if (!parsedParams.success) {
      logWarn('admin_product_delete_invalid_product_id', {
        ...baseMeta,
        code: 'INVALID_PRODUCT_ID',
        issuesCount: parsedParams.error.issues?.length ?? 0,
        durationMs: Date.now() - startedAtMs,
      });

      return noStoreJson(
        {
          error: 'Invalid product id',
          code: 'INVALID_PRODUCT_ID',
          details: parsedParams.error.format(),
        },
        { status: 400 }
      );
    }

    productIdForLog = parsedParams.data.id;

    await deleteProduct(productIdForLog);

    return noStoreJson({ success: true }, { status: 200 });
  } catch (error) {
    if (error instanceof AdminApiDisabledError) {
      logWarn('admin_product_delete_admin_api_disabled', {
        ...baseMeta,
        code: error.code,
        productId: productIdForLog,
        durationMs: Date.now() - startedAtMs,
      });
      return noStoreJson({ code: error.code }, { status: 403 });
    }

    if (error instanceof AdminUnauthorizedError) {
      logWarn('admin_product_delete_unauthorized', {
        ...baseMeta,
        code: error.code,
        productId: productIdForLog,
        durationMs: Date.now() - startedAtMs,
      });
      return noStoreJson({ code: error.code }, { status: 401 });
    }

    if (error instanceof AdminForbiddenError) {
      logWarn('admin_product_delete_forbidden', {
        ...baseMeta,
        code: error.code,
        productId: productIdForLog,
        durationMs: Date.now() - startedAtMs,
      });
      return noStoreJson({ code: error.code }, { status: 403 });
    }

    if (error instanceof Error && error.message === 'PRODUCT_NOT_FOUND') {
      logWarn('admin_product_delete_not_found', {
        ...baseMeta,
        code: 'PRODUCT_NOT_FOUND',
        productId: productIdForLog,
        durationMs: Date.now() - startedAtMs,
      });

      return noStoreJson(
        { error: 'Product not found', code: 'PRODUCT_NOT_FOUND' },
        { status: 404 }
      );
    }

    logError('admin_product_delete_failed', error, {
      ...baseMeta,
      code: 'ADMIN_PRODUCT_DELETE_FAILED',
      productId: productIdForLog,
      durationMs: Date.now() - startedAtMs,
    });

    return noStoreJson(
      { error: 'internal_error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
