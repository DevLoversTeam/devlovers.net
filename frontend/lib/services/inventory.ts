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

// Robust status extractor for Drizzle/Neon variations.
// We do NOT treat "unknown shape" as "insufficient" because that breaks invariants.
function readStatus(res: unknown): string {
  const r: any = res as any;

  // Common shapes:
  // 1) { rows: [ { status: '...' } ] }
  // 2) [ { status: '...' } ]
  // 3) { rowCount, rows } but keys can be uppercase depending on driver
  const rows = Array.isArray(r) ? r : Array.isArray(r?.rows) ? r.rows : undefined;
  const row = rows?.[0];

  const status = row?.status ?? row?.STATUS;
  if (typeof status === 'string' && status.length > 0) return status;

  // Fail hard: better than silently turning into OUT_OF_STOCK and doing release.
  throw new Error(
    `inventory: unexpected db.execute result shape (missing status). ` +
      `Got: ${JSON.stringify(
        { hasRows: !!r?.rows, topKeys: r && typeof r === 'object' ? Object.keys(r).slice(0, 20) : typeof r },
        null,
        0
      )}`
  );
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
    -- serialize by move_key (prevents concurrent double-decrement)
    locked AS (
      SELECT 1 AS ok
      FROM c
      CROSS JOIN LATERAL (
        SELECT pg_advisory_xact_lock(hashtext(c.move_key), 0)
      ) _l
    ),
    already AS (
      SELECT 1
      FROM inventory_moves m, c, locked
      WHERE m.move_key = c.move_key
        AND m.type = 'reserve'
      LIMIT 1
    ),
    upd AS (
      UPDATE products p
      SET stock = p.stock - c.qty, updated_at = now()
      FROM c, locked
      WHERE p.id = c.product_id
        AND p.stock >= c.qty
        AND NOT EXISTS (SELECT 1 FROM already)
      RETURNING 1
    ),
    ins AS (
      INSERT INTO inventory_moves (move_key, order_id, product_id, type, quantity)
      SELECT c.move_key, c.order_id, c.product_id, 'reserve', c.qty
      FROM c, locked
      WHERE EXISTS (SELECT 1 FROM upd)
      ON CONFLICT (move_key) DO NOTHING
      RETURNING 1
    )
    SELECT
      CASE
        WHEN EXISTS (SELECT 1 FROM already) THEN 'already'
        WHEN EXISTS (SELECT 1 FROM upd) THEN 'applied'
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
        WHEN EXISTS (SELECT 1 FROM inventory_moves m WHERE m.move_key = (SELECT release_key FROM c)) THEN 'already'
        ELSE 'noop'
      END AS status;
  `);

  const status = readStatus(res);
  if (status === 'applied') return { ok: true, applied: true };
  if (status === 'already' || status === 'no_reserve' || status === 'noop') {
    return { ok: true, applied: false };
  }

  throw new Error(`applyReleaseMove: unexpected status "${status}"`);
}
