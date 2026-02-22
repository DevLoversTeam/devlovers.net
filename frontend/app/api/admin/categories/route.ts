import { eq, max } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { categories, categoryTranslations } from '@/db/schema/categories';
import {
  AdminApiDisabledError,
  AdminForbiddenError,
  AdminUnauthorizedError,
  requireAdminApi,
} from '@/lib/auth/admin';
import { logError } from '@/lib/logging';
import { requireAdminCsrf } from '@/lib/security/admin-csrf';
import { guardBrowserSameOrigin } from '@/lib/security/origin';
import { createCategorySchema } from '@/lib/validation/admin-quiz';

export const runtime = 'nodejs';

const LOCALES = ['en', 'uk', 'pl'] as const;

function noStoreJson(body: unknown, init?: { status?: number }) {
  const res = NextResponse.json(body, { status: init?.status ?? 200 });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const blocked = guardBrowserSameOrigin(request);
  if (blocked) {
    blocked.headers.set('Cache-Control', 'no-store');
    return blocked;
  }

  try {
    await requireAdminApi(request);

    const csrfResult = requireAdminCsrf(request, 'admin:category:create');
    if (csrfResult) {
      csrfResult.headers.set('Cache-Control', 'no-store');
      return csrfResult;
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return noStoreJson({ error: 'Invalid JSON body', code: 'INVALID_BODY' }, { status: 400 });
    }

    const parsed = createCategorySchema.safeParse(rawBody);
    if (!parsed.success) {
      return noStoreJson(
        { error: 'Invalid payload', code: 'INVALID_PAYLOAD', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { slug, translations } = parsed.data;

    // Auto displayOrder
    const [maxRow] = await db
      .select({ maxOrder: max(categories.displayOrder) })
      .from(categories);

    const displayOrder = (maxRow?.maxOrder ?? 0) + 1;

    // Insert category (onConflictDoNothing handles duplicate slug race)
    const rows = await db
      .insert(categories)
      .values({ slug, displayOrder })
      .onConflictDoNothing({ target: categories.slug })
      .returning({ id: categories.id });

    if (rows.length === 0) {
      return noStoreJson(
        { error: 'Category with this slug already exists', code: 'DUPLICATE_SLUG' },
        { status: 409 }
      );
    }

    const category = rows[0];

    // Insert translations (cleanup orphan category on failure)
    try {
      await db.insert(categoryTranslations).values(
        LOCALES.map(locale => ({
          categoryId: category.id,
          locale,
          title: translations[locale].title,
        }))
      );
    } catch (translationError) {
      await db.delete(categories).where(eq(categories.id, category.id));
      throw translationError;
    }

    return noStoreJson({
      success: true,
      category: { id: category.id, slug, title: translations.en.title },
    });
  } catch (error) {
    if (error instanceof AdminApiDisabledError) {
      return noStoreJson({ code: error.code }, { status: 403 });
    }
    if (error instanceof AdminUnauthorizedError) {
      return noStoreJson({ code: error.code }, { status: 401 });
    }
    if (error instanceof AdminForbiddenError) {
      return noStoreJson({ code: error.code }, { status: 403 });
    }

    logError('admin_category_create_failed', error, {
      route: request.nextUrl.pathname,
      method: request.method,
    });

    return noStoreJson({ error: 'Internal error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
