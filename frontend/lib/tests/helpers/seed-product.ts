import crypto from 'crypto';
import { eq, sql } from 'drizzle-orm';

import { db } from '@/db';
import { productPrices, products } from '@/db/schema';
import { toDbMoney } from '@/lib/shop/money';

let __seedTemplateProductId: string | null = null;

function readRows<T = any>(res: any): T[] {
  if (Array.isArray(res)) return res as T[];
  if (Array.isArray(res?.rows)) return res.rows as T[];
  return [];
}

type ColumnInfo = {
  column_name: string;
  is_nullable: 'YES' | 'NO';
  column_default: string | null;
  data_type: string;
  udt_name: string;
  is_identity?: 'YES' | 'NO';
  is_generated?: 'ALWAYS' | 'NEVER';
};

function qIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

async function getFirstEnumLabel(typeName: string): Promise<string> {
  const res = await db.execute(sql`
    select e.enumlabel as label
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    where t.typname = ${typeName}
    order by e.enumsortorder asc
    limit 1
  `);
  const rows = readRows<{ label?: unknown }>(res);
  const label = rows[0]?.label;
  if (typeof label !== 'string' || !label.trim()) {
    throw new Error(`Unable to resolve enum label for type "${typeName}".`);
  }
  return label;
}

export async function getOrSeedActiveTemplateProduct(): Promise<any> {
  const [existing] = await db
    .select()
    .from(products)
    .where(eq(products.isActive as any, true))
    .limit(1);

  if (existing) return existing;

  const productId = crypto.randomUUID();
  const slug = `t-seed-${crypto.randomUUID()}`;
  const sku = `t-seed-${crypto.randomUUID()}`;
  const now = new Date();

  __seedTemplateProductId = productId;

  const infoRes = await db.execute(sql`
    select
      column_name,
      is_nullable,
      column_default,
      data_type,
      udt_name,
      is_identity,
      is_generated
    from information_schema.columns
    where table_schema = 'public' and table_name = 'products'
    order by ordinal_position asc
  `);

  const cols = readRows<ColumnInfo>(infoRes);
  if (!cols.length) throw new Error('Unable to introspect products columns.');

  const preferred: Record<string, unknown> = {
    id: productId,
    slug,
    sku,
    title: `Seed ${slug}`,
    stock: 9999,
    is_active: true,
    created_at: now,
    updated_at: now,
  };

  const insertCols: string[] = [];
  const insertVals: any[] = [];

  for (const c of cols) {
    const col = c.column_name;
    const hasPreferred = Object.prototype.hasOwnProperty.call(preferred, col);
    const isGenerated = c.is_generated === 'ALWAYS';
    const isIdentity = c.is_identity === 'YES';
    const requiredNoDefault =
      c.is_nullable === 'NO' &&
      (c.column_default === null || c.column_default === undefined);

    if (isGenerated || isIdentity) continue;
    if (!hasPreferred && !requiredNoDefault) continue;

    insertCols.push(col);

    if (hasPreferred) {
      insertVals.push(sql`${preferred[col]}`);
      continue;
    }

    if (c.data_type === 'USER-DEFINED') {
      const enumLabel = await getFirstEnumLabel(c.udt_name);
      insertVals.push(sql`${enumLabel}::${sql.raw(qIdent(c.udt_name))}`);
      continue;
    }

    switch (c.data_type) {
      case 'boolean':
        insertVals.push(sql`false`);
        break;
      case 'smallint':
      case 'integer':
      case 'bigint':
        insertVals.push(sql`0`);
        break;

      case 'numeric':
      case 'real':
      case 'double precision':
        if (/price/i.test(col)) insertVals.push(sql`1`);
        else insertVals.push(sql`0`);
        break;

      case 'uuid':
        insertVals.push(sql`${crypto.randomUUID()}::uuid`);
        break;

      case 'jsonb':
        insertVals.push(sql`${JSON.stringify({})}::jsonb`);
        break;

      case 'json':
        insertVals.push(sql`${JSON.stringify({})}::json`);
        break;

      case 'date':
        insertVals.push(sql`${now.toISOString().slice(0, 10)}`);
        break;

      case 'timestamp with time zone':
      case 'timestamp without time zone':
      case 'timestamp':
        insertVals.push(sql`${now}`);
        break;

      default:
        insertVals.push(sql`${`seed_${col}_${crypto.randomUUID()}`}`);
        break;
    }
  }

  const colSql = insertCols.map(c => sql.raw(qIdent(c)));

  await db.execute(sql`
    insert into "products" (${sql.join(colSql, sql`, `)})
    values (${sql.join(insertVals, sql`, `)})
  `);

  await db.insert(productPrices).values([
    {
      productId,
      currency: 'UAH',
      priceMinor: 1000,
      originalPriceMinor: null,
      price: toDbMoney(1000),
      originalPrice: null,
      createdAt: now,
      updatedAt: now,
    } as any,
    {
      productId,
      currency: 'USD',
      priceMinor: 1000,
      originalPriceMinor: null,
      price: toDbMoney(1000),
      originalPrice: null,
      createdAt: now,
      updatedAt: now,
    } as any,
  ]);

  const [seeded] = await db
    .select()
    .from(products)
    .where(eq(products.id as any, productId))
    .limit(1);

  if (!seeded) throw new Error('Failed to seed template product.');
  return seeded;
}

export async function cleanupSeededTemplateProduct(): Promise<void> {
  if (!__seedTemplateProductId) return;
  const productId = __seedTemplateProductId;
  __seedTemplateProductId = null;

  try {
    await db.execute(
      sql`delete from inventory_moves where product_id = ${productId}::uuid`
    );
  } catch {}

  try {
    await db.execute(
      sql`delete from order_items where product_id = ${productId}::uuid`
    );
  } catch {}

  try {
    await db.delete(productPrices).where(eq(productPrices.productId, productId));
  } catch {}

  try {
    await db.delete(products).where(eq(products.id, productId));
  } catch {}
}