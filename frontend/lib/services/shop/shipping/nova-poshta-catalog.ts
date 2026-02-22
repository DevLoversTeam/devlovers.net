import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/db';
import { logWarn } from '@/lib/logging';

import {
  getWarehousesBySettlementRef,
  searchSettlements,
  type NovaPoshtaSettlement,
  type NovaPoshtaWarehouse,
} from './nova-poshta-client';

type CityRow = {
  ref: unknown;
  name_ua: unknown;
  name_ru: unknown;
  area: unknown;
  region: unknown;
  settlement_type: unknown;
};

type WarehouseRow = {
  ref: unknown;
  settlement_ref: unknown;
  city_ref: unknown;
  number: unknown;
  type: unknown;
  name: unknown;
  name_ru: unknown;
  address: unknown;
  address_ru: unknown;
  is_post_machine: unknown;
};

export type ShippingCity = {
  ref: string;
  nameUa: string;
  nameRu: string | null;
  area: string | null;
  region: string | null;
  settlementType: string | null;
};

export type ShippingWarehouse = {
  ref: string;
  settlementRef: string | null;
  cityRef: string | null;
  number: string | null;
  type: string | null;
  name: string;
  nameRu: string | null;
  address: string | null;
  addressRu: string | null;
  isPostMachine: boolean;
};

function toStringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toBoolean(value: unknown): boolean {
  return value === true;
}

function mapCityRow(row: CityRow): ShippingCity | null {
  const ref = toStringOrNull(row.ref);
  const nameUa = toStringOrNull(row.name_ua);
  if (!ref || !nameUa) return null;
  return {
    ref,
    nameUa,
    nameRu: toStringOrNull(row.name_ru),
    area: toStringOrNull(row.area),
    region: toStringOrNull(row.region),
    settlementType: toStringOrNull(row.settlement_type),
  };
}

function mapWarehouseRow(row: WarehouseRow): ShippingWarehouse | null {
  const ref = toStringOrNull(row.ref);
  const name = toStringOrNull(row.name);
  if (!ref || !name) return null;
  return {
    ref,
    settlementRef: toStringOrNull(row.settlement_ref),
    cityRef: toStringOrNull(row.city_ref),
    number: toStringOrNull(row.number),
    type: toStringOrNull(row.type),
    name,
    nameRu: toStringOrNull(row.name_ru),
    address: toStringOrNull(row.address),
    addressRu: toStringOrNull(row.address_ru),
    isPostMachine: toBoolean(row.is_post_machine),
  };
}

export async function findCachedCities(args: {
  q: string;
  limit: number;
}): Promise<ShippingCity[]> {
  const like = `%${args.q}%`;
  const res = await db.execute<CityRow>(sql`
    SELECT ref, name_ua, name_ru, area, region, settlement_type
    FROM np_cities
    WHERE is_active = true
      AND (
        name_ua ILIKE ${like}
        OR COALESCE(name_ru, '') ILIKE ${like}
      )
    ORDER BY name_ua ASC
    LIMIT ${args.limit}
  `);

  const rows = ((res as any).rows ?? []) as CityRow[];
  const out: ShippingCity[] = [];
  for (const row of rows) {
    const mapped = mapCityRow(row);
    if (mapped) out.push(mapped);
  }
  return out;
}

export async function findCachedWarehouses(args: {
  settlementRef: string;
  q?: string;
  limit: number;
}): Promise<ShippingWarehouse[]> {
  const hasQ = !!args.q?.trim();
  const like = `%${(args.q ?? '').trim()}%`;
  const res = await db.execute<WarehouseRow>(sql`
    SELECT ref, settlement_ref, city_ref, number, type, name, name_ru, address, address_ru, is_post_machine
    FROM np_warehouses
    WHERE is_active = true
      AND settlement_ref = ${args.settlementRef}
      AND (
        ${hasQ} = false
        OR name ILIKE ${like}
        OR COALESCE(address, '') ILIKE ${like}
        OR COALESCE(number, '') ILIKE ${like}
      )
    ORDER BY
      COALESCE(NULLIF(number, ''), '9999') ASC,
      name ASC
    LIMIT ${args.limit}
  `);

  const rows = ((res as any).rows ?? []) as WarehouseRow[];
  const out: ShippingWarehouse[] = [];
  for (const row of rows) {
    const mapped = mapWarehouseRow(row);
    if (mapped) out.push(mapped);
  }
  return out;
}

async function upsertCities(rows: NovaPoshtaSettlement[], runId: string) {
  if (!rows.length) return;

  const values = rows.map(item => {
    return sql`(
      ${item.ref},
      ${item.nameUa},
      ${item.nameRu},
      ${item.area},
      ${item.region},
      ${item.settlementType},
      true,
      ${runId}::uuid,
      now(),
      now()
    )`;
  });

  await db.execute(sql`
    INSERT INTO np_cities (
      ref,
      name_ua,
      name_ru,
      area,
      region,
      settlement_type,
      is_active,
      last_sync_run_id,
      created_at,
      updated_at
    )
    VALUES ${sql.join(values, sql`, `)}
    ON CONFLICT (ref) DO UPDATE
      SET
        name_ua = EXCLUDED.name_ua,
        name_ru = EXCLUDED.name_ru,
        area = EXCLUDED.area,
        region = EXCLUDED.region,
        settlement_type = EXCLUDED.settlement_type,
        is_active = true,
        last_sync_run_id = EXCLUDED.last_sync_run_id,
        updated_at = now()
  `);
}

async function upsertWarehouses(rows: NovaPoshtaWarehouse[], runId: string) {
  if (!rows.length) return;

  const values = rows.map(item => {
    return sql`(
      ${item.ref},
      ${item.cityRef},
      ${item.settlementRef},
      ${item.number},
      ${item.type},
      ${item.name},
      ${item.nameRu},
      ${item.address},
      ${item.addressRu},
      ${item.isPostMachine},
      true,
      ${runId}::uuid,
      now(),
      now()
    )`;
  });

  await db.execute(sql`
    INSERT INTO np_warehouses (
      ref,
      city_ref,
      settlement_ref,
      number,
      type,
      name,
      name_ru,
      address,
      address_ru,
      is_post_machine,
      is_active,
      last_sync_run_id,
      created_at,
      updated_at
    )
    VALUES ${sql.join(values, sql`, `)}
    ON CONFLICT (ref) DO UPDATE
      SET
        city_ref = EXCLUDED.city_ref,
        settlement_ref = EXCLUDED.settlement_ref,
        number = EXCLUDED.number,
        type = EXCLUDED.type,
        name = EXCLUDED.name,
        name_ru = EXCLUDED.name_ru,
        address = EXCLUDED.address,
        address_ru = EXCLUDED.address_ru,
        is_post_machine = EXCLUDED.is_post_machine,
        is_active = true,
        last_sync_run_id = EXCLUDED.last_sync_run_id,
        updated_at = now()
  `);
}

async function deactivateMissingWarehouses(args: {
  settlementRef: string;
  keepRefs: string[];
  runId: string;
}) {
  const keepRefs = args.keepRefs.filter(x => x.trim().length > 0);

  if (!keepRefs.length) {
    await db.execute(sql`
      UPDATE np_warehouses
      SET
        is_active = false,
        last_sync_run_id = ${args.runId}::uuid,
        updated_at = now()
      WHERE settlement_ref = ${args.settlementRef}
    `);
    return;
  }

  const refs = keepRefs.map(ref => sql`${ref}`);
  await db.execute(sql`
    UPDATE np_warehouses
    SET
      is_active = false,
      last_sync_run_id = ${args.runId}::uuid,
      updated_at = now()
    WHERE settlement_ref = ${args.settlementRef}
      AND ref NOT IN (${sql.join(refs, sql`, `)})
  `);
}

export async function cacheSettlementsByQuery(args: {
  q: string;
  runId: string;
  limit: number;
}): Promise<{ upserted: number }> {
  const settlements = await searchSettlements({
    q: args.q,
    page: 1,
    limit: args.limit,
  });
  await upsertCities(settlements, args.runId);
  return { upserted: settlements.length };
}

export async function cacheWarehousesBySettlement(args: {
  settlementRef: string;
  runId: string;
}): Promise<{ upserted: number; deactivated: number }> {
  const warehouses = await getWarehousesBySettlementRef(args.settlementRef);
  await upsertWarehouses(warehouses, args.runId);
  await deactivateMissingWarehouses({
    settlementRef: args.settlementRef,
    keepRefs: warehouses.map(x => x.ref),
    runId: args.runId,
  });
  return {
    upserted: warehouses.length,
    deactivated: 0,
  };
}

export async function findCitiesWithCacheOnMiss(args: {
  q: string;
  limit: number;
  runId: string;
}): Promise<ShippingCity[]> {
  const localResults = await findCachedCities({ q: args.q, limit: args.limit });
  if (localResults.length > 0) {
    return localResults.slice(0, args.limit);
  }

  try {
    await cacheSettlementsByQuery({
      q: args.q,
      limit: args.limit,
      runId: args.runId,
    });
  } catch (error) {
    logWarn('np_cities_cache_on_miss_failed', {
      code: 'NP_CACHE_REFRESH_FAILED',
      runId: args.runId,
    });
    throw error;
  }

  const refreshedLocalResults = await findCachedCities({
    q: args.q,
    limit: args.limit,
  });
  return refreshedLocalResults.slice(0, args.limit);
}

export async function findWarehousesWithCacheOnMiss(args: {
  settlementRef: string;
  q?: string;
  limit: number;
  runId: string;
}): Promise<ShippingWarehouse[]> {
  const localResults = await findCachedWarehouses({
    settlementRef: args.settlementRef,
    q: args.q,
    limit: args.limit,
  });
  if (localResults.length > 0) {
    return localResults.slice(0, args.limit);
  }

  try {
    await cacheWarehousesBySettlement({
      settlementRef: args.settlementRef,
      runId: args.runId,
    });
  } catch (error) {
    logWarn('np_warehouses_cache_on_miss_failed', {
      code: 'NP_CACHE_REFRESH_FAILED',
      runId: args.runId,
      settlementRef: args.settlementRef,
    });
    throw error;
  }

  const refreshedLocalResults = await findCachedWarehouses({
    settlementRef: args.settlementRef,
    q: args.q,
    limit: args.limit,
  });
  return refreshedLocalResults.slice(0, args.limit);
}
