import { NextRequest, NextResponse } from 'next/server';

import { getCatalogProducts } from '@/lib/shop/data';
import { catalogQuerySchema } from '@/lib/validation/shop';
import { CATALOG_PAGE_SIZE } from '@/lib/config/catalog';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const raw = Object.fromEntries(url.searchParams.entries()) as RawSearchParams;

  const { locale, ...rest } = raw;
  const effectiveLocale = locale ?? 'en';

  const parsed = catalogQuerySchema.safeParse(rest);

  const filters = parsed.success
    ? parsed.data
    : { page: 1, limit: CATALOG_PAGE_SIZE };

  const catalog = await getCatalogProducts(filters, effectiveLocale);

  return NextResponse.json(catalog, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
