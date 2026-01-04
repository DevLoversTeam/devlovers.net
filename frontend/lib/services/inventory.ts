import { sql } from 'drizzle-orm';
import { db } from '@/db';

type ReserveResult =
  | { ok: true; applied: boolean }
  | { ok: false; reason: 'INSUFFICIENT_STOCK' };

function reserveKey(orderId: string, productId: string) {
  return `reserve:${orderId}:${productId}`;
}
function releaseKey(orderId: string, productId: string) {
  return `release:${orderId}:${productId}`;
}

export async function applyReserveMove(
  orderId: string,
  productId: string,
  quantity: number
): Promise<ReserveResult> {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error('Invalid reserve quantity');
  }

  const rKey = reserveKey(orderId, productId);

  const res = await db.execute(sql`
    WITH c AS (
      SELECT
        ${orderId}::uuid   AS order_id,
        ${productId}::uuid AS product_id,
        ${quantity}::int   AS qty,
        ${rKey}::varchar   AS move_key
    ),
    claimed AS (
      INSERT INTO inventory_moves (move_key, order_id, product_id, type, quantity)
      SELECT c.move_key, c.order_id, c.product_id, 'reserve', c.qty
      FROM c
      ON CONFLICT (move_key) DO NOTHING
      RETURNING 1
    ),
    upd AS (
      UPDATE products p
      SET stock = p.stock - c.qty, updated_at = now()
      FROM c
      WHERE p.id = c.product_id
        AND p.stock >= c.qty
        AND EXISTS (SELECT 1 FROM claimed)
      RETURNING 1
    ),
    rollback_claim AS (
      DELETE FROM inventory_moves m
      USING c
      WHERE m.move_key = c.move_key
        AND m.type = 'reserve'
        AND EXISTS (SELECT 1 FROM claimed)
        AND NOT EXISTS (SELECT 1 FROM upd)
      RETURNING 1
    )
    SELECT
      CASE
        WHEN EXISTS (SELECT 1 FROM upd) THEN 'applied'
        WHEN NOT EXISTS (SELECT 1 FROM claimed)
             AND EXISTS (SELECT 1 FROM inventory_moves m WHERE m.move_key = (SELECT move_key FROM c) AND m.type='reserve')
          THEN 'already'
        ELSE 'insufficient'
      END AS status;
  `);

  const status = (res.rows?.[0] as any)?.status as string | undefined;
  if (status === 'applied') return { ok: true, applied: true };
  if (status === 'already') return { ok: true, applied: false };
  return { ok: false, reason: 'INSUFFICIENT_STOCK' };
}

export async function applyReleaseMove(
  orderId: string,
  productId: string,
  quantity: number
): Promise<{ ok: true; applied: boolean }> {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error('Invalid release quantity');
  }

  const rKey = reserveKey(orderId, productId);
  const relKey = releaseKey(orderId, productId);

  const res = await db.execute(sql`
    WITH c AS (
      SELECT
        ${orderId}::uuid   AS order_id,
        ${productId}::uuid AS product_id,
        ${quantity}::int   AS qty,
        ${rKey}::varchar   AS reserve_key,
        ${relKey}::varchar AS release_key
    ),
    has_reserve AS (
      SELECT 1
      FROM inventory_moves m, c
      WHERE m.move_key = c.reserve_key
        AND m.type = 'reserve'
      LIMIT 1
    ),
    claimed AS (
      INSERT INTO inventory_moves (move_key, order_id, product_id, type, quantity)
      SELECT c.release_key, c.order_id, c.product_id, 'release', c.qty
      FROM c
      WHERE EXISTS (SELECT 1 FROM has_reserve)
      ON CONFLICT (move_key) DO NOTHING
      RETURNING 1
    ),
    upd AS (
      UPDATE products p
      SET stock = p.stock + c.qty, updated_at = now()
      FROM c
      WHERE p.id = c.product_id
        AND EXISTS (SELECT 1 FROM claimed)
      RETURNING 1
    )
    SELECT
      CASE
        WHEN EXISTS (SELECT 1 FROM upd) THEN 'applied'
        WHEN NOT EXISTS (SELECT 1 FROM has_reserve) THEN 'no_reserve'
        WHEN EXISTS (SELECT 1 FROM inventory_moves m WHERE m.move_key = (SELECT release_key FROM c) AND m.type='release') THEN 'already'
        ELSE 'noop'
      END AS status;
  `);

  const status = (res.rows?.[0] as any)?.status as string | undefined;
  if (status === 'applied') return { ok: true, applied: true };
  // 'already' | 'no_reserve' | 'noop' => idempotent no-op
  return { ok: true, applied: false };
}
