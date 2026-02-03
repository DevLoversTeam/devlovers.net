import { and, eq, ne } from 'drizzle-orm';

import { products } from '@/db/schema';
import { slugify } from '@/lib/shop/slug';

import { SlugConflictError } from '../errors';
import type { DbClient } from './types';

function randomSuffix(length = 6) {
  return Math.random()
    .toString(36)
    .substring(2, 2 + length);
}

async function ensureUniqueSlug(
  db: DbClient,
  baseSlug: string,
  options?: { excludeId?: string }
): Promise<string> {
  let candidate = baseSlug;
  let attempts = 0;

  while (true) {
    const existing = await db
      .select({ id: products.id })
      .from(products)
      .where(
        options?.excludeId
          ? and(
              eq(products.slug, candidate),
              ne(products.id, options.excludeId)
            )
          : eq(products.slug, candidate)
      )
      .limit(1);

    if (!existing.length) return candidate;

    attempts += 1;
    if (attempts > 10) {
      throw new SlugConflictError('Unable to generate unique slug');
    }

    candidate = `${baseSlug}-${randomSuffix()}`;
  }
}

export async function normalizeSlug(
  db: DbClient,
  slug: string,
  options?: { excludeId?: string }
) {
  const normalized = slugify(slug);
  if (!normalized) {
    throw new SlugConflictError('Slug could not be generated');
  }
  return ensureUniqueSlug(db, normalized, options);
}
