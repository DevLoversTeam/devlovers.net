import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import { getCatalogProducts } from '@/lib/shop/data';
import { catalogQuerySchema } from '@/lib/validation/shop';
import { CATALOG_PAGE_SIZE } from '@/lib/config/catalog';
import { logError, logWarn } from '@/lib/logging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function noStoreJson(body: unknown, init?: { status?: number }) {
  const res = NextResponse.json(body, { status: init?.status ?? 200 });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

type RawSearchParams = {
  category?: string;
  type?: string;
  color?: string;
  size?: string;
  sort?: string;
  page?: string;
  limit?: string;
  locale?: string;
};

function normalizeLocale(input: unknown): 'en' | 'uk' {
  const raw = typeof input === 'string' ? input.trim().toLowerCase() : '';
  if (raw === 'uk' || raw.startsWith('uk-')) return 'uk';
  return 'en';
}

export async function GET(request: NextRequest) {
  const startedAtMs = Date.now();

  const requestId =
    request.headers.get('x-request-id')?.trim() || crypto.randomUUID();

  const baseMeta = {
    requestId,
    route: request.nextUrl.pathname,
    method: request.method,
  };

  const raw = Object.fromEntries(
    request.nextUrl.searchParams.entries()
  ) as RawSearchParams;

  const { locale, ...rest } = raw;
  const effectiveLocale = normalizeLocale(locale);

  const parsed = catalogQuerySchema.safeParse(rest);

  if (!parsed.success) {
    logWarn('shop_catalog_invalid_query', {
      ...baseMeta,
      code: 'INVALID_QUERY',
      locale: effectiveLocale,
      issuesCount: parsed.error.issues?.length ?? 0,
      durationMs: Date.now() - startedAtMs,
    });
  }

  const filters = parsed.success
    ? parsed.data
    : { page: 1, limit: CATALOG_PAGE_SIZE };

  try {
    const catalog = await getCatalogProducts(filters, effectiveLocale);
    return noStoreJson(catalog, { status: 200 });
  } catch (error) {
    logError('shop_catalog_failed', error, {
      ...baseMeta,
      code: 'SHOP_CATALOG_FAILED',
      locale: effectiveLocale,
      durationMs: Date.now() - startedAtMs,
    });

    return noStoreJson(
      { error: 'internal_error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
