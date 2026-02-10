import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/db';
import { productPrices, products } from '@/db/schema';

type IndexRow = { indexname?: string };

function normalizeIndexRows(result: unknown): string[] {
  const rows = (result as { rows?: IndexRow[] })?.rows ?? [];
  return rows
    .map(r => (typeof r.indexname === 'string' ? r.indexname : ''))
    .filter(Boolean);
}

async function verifyUahPrices() {
  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      title: products.title,
      priceMinor: productPrices.priceMinor,
    })
    .from(products)
    .leftJoin(
      productPrices,
      and(
        eq(productPrices.productId, products.id),
        eq(productPrices.currency, 'UAH')
      )
    )
    .where(eq(products.isActive, true));

  const missing = rows.filter(row => {
    const v = row.priceMinor;
    if (v === null || v === undefined) return true;
    if (typeof v === 'number') return v < 0;
    if (typeof v === 'bigint') return v < BigInt(0);

    return true;
  });

  if (missing.length === 0) {
    console.log('OK: All active products have UAH price rows.');
    return true;
  }

  console.error('FAIL: Missing/invalid UAH prices for active products:');
  for (const row of missing) {
    console.error(
      `- id=${row.id} slug=${row.slug ?? 'n/a'} title=${row.title ?? 'n/a'}`
    );
  }
  return false;
}

async function verifyIndexes() {
  const res = await db.execute(sql`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'payment_attempts'
      AND indexname IN (
        'payment_attempts_order_provider_active_unique',
        'payment_attempts_provider_status_updated_idx'
      );
  `);

  const existing = new Set(normalizeIndexRows(res));
  const required = [
    'payment_attempts_order_provider_active_unique',
    'payment_attempts_provider_status_updated_idx',
  ];

  const missing = required.filter(name => !existing.has(name));
  if (missing.length === 0) {
    console.log('OK: Required payment_attempts indexes are present.');
    return true;
  }

  console.error(
    `FAIL: Missing payment_attempts indexes: ${missing.join(', ')}`
  );
  return false;
}

async function main() {
  const okPrices = await verifyUahPrices();
  const okIndexes = await verifyIndexes();

  if (!okPrices || !okIndexes) {
    process.exitCode = 1;
  }
}

main().catch(err => {
  console.error('B3 verification failed:', err);
  process.exitCode = 1;
});
