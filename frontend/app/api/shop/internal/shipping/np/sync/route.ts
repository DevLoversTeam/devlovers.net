import crypto from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { requireInternalJanitorAuth } from '@/lib/auth/internal-janitor';
import { getShopShippingFlags } from '@/lib/env/nova-poshta';
import { getRequestId } from '@/lib/http/getRequestId';
import { logError, logInfo, logWarn } from '@/lib/logging';
import { guardNonBrowserFailClosed } from '@/lib/security/origin';
import {
  sanitizeShippingErrorForLog,
  sanitizeShippingLogMeta,
} from '@/lib/services/shop/shipping/log-sanitizer';
import {
  cacheSettlementsByQuery,
  cacheWarehousesByCityRef,
} from '@/lib/services/shop/shipping/nova-poshta-catalog';
import { NovaPoshtaApiError } from '@/lib/services/shop/shipping/nova-poshta-client';
import {
  getInternalShippingMinIntervalFloorSeconds,
  internalNpSyncPayloadSchema,
} from '@/lib/validation/shop-shipping';

import {
  acquireShippingJobSlot,
  shippingJobRateLimitedResponse,
} from '../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const JOB_NAME = 'shipping-np-sync';
const ROUTE_PATH = '/api/shop/internal/shipping/np/sync';

function noStoreJson(body: unknown, requestId: string, status = 200) {
  const res = NextResponse.json(body, { status });
  res.headers.set('Cache-Control', 'no-store');
  res.headers.set('X-Request-Id', requestId);
  return res;
}

function buildSafeDebugPayload(error: unknown) {
  return {
    env: {
      isNpApiKeyConfigured: (process.env.NP_API_KEY ?? '').trim().length > 0,
      shopShippingNpEnabled:
        (process.env.SHOP_SHIPPING_NP_ENABLED ?? '').trim() || null,
      shopShippingSyncEnabled:
        (process.env.SHOP_SHIPPING_SYNC_ENABLED ?? '').trim() || null,
      appEnv: (process.env.APP_ENV ?? '').trim() || null,
      vercelEnv: (process.env.VERCEL_ENV ?? '').trim() || null,
    },
    error: {
      errorClass: error instanceof Error ? error.name : typeof error,
      isNovaPoshtaError: error instanceof NovaPoshtaApiError,
      code: error instanceof NovaPoshtaApiError ? error.code : null,
      status: error instanceof NovaPoshtaApiError ? error.status : null,
    },
  };
}

function isNonProductionAppStage(): boolean {
  const appEnv = (process.env.APP_ENV ?? '').trim().toLowerCase();
  const vercelEnv = (process.env.VERCEL_ENV ?? '').trim().toLowerCase();

  if (appEnv) {
    return appEnv !== 'production' && appEnv !== 'prod';
  }

  if (vercelEnv) {
    return vercelEnv !== 'production';
  }

  // Deliberately fail closed: if stage env is unset, treat the route as
  // production-like so debug payloads are not exposed by default.
  return false;
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request.headers);
  const runId = crypto.randomUUID();
  const baseMeta = {
    requestId,
    runId,
    route: ROUTE_PATH,
    method: request.method,
  };
  const debugEnabled =
    isNonProductionAppStage() &&
    (request.headers.get('x-shop-debug') ?? '').trim() === '1';
  const blocked = guardNonBrowserFailClosed(request, {
    surface: 'shop_shipping_np_sync',
  });
  if (blocked) {
    blocked.headers.set('X-Request-Id', requestId);
    return blocked;
  }

  const authRes = requireInternalJanitorAuth(request);
  if (authRes) {
    authRes.headers.set('X-Request-Id', requestId);
    authRes.headers.set('Cache-Control', 'no-store');
    return authRes;
  }

  const flags = getShopShippingFlags();
  if (!flags.shippingEnabled || !flags.npEnabled || !flags.syncEnabled) {
    return noStoreJson(
      {
        success: false,
        code: 'FEATURE_DISABLED',
      },
      requestId,
      200
    );
  }

  const contentType = (request.headers.get('content-type') ?? '').toLowerCase();
  if (!contentType.includes('application/json')) {
    return noStoreJson(
      {
        success: false,
        code: 'INVALID_PAYLOAD',
        message: 'Content-Type must be application/json',
      },
      requestId,
      400
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return noStoreJson(
      {
        success: false,
        code: 'INVALID_PAYLOAD',
        message: 'Invalid JSON body',
      },
      requestId,
      400
    );
  }

  const parsed = internalNpSyncPayloadSchema.safeParse(rawBody);
  if (!parsed.success) {
    return noStoreJson(
      {
        success: false,
        code: 'INVALID_PAYLOAD',
        message: 'Invalid payload',
      },
      requestId,
      400
    );
  }

  const requestedMinIntervalSeconds = parsed.data.minIntervalSeconds;
  const effectiveIntervalSeconds = Math.max(
    getInternalShippingMinIntervalFloorSeconds(),
    requestedMinIntervalSeconds
  );
  const wasClamped = effectiveIntervalSeconds !== requestedMinIntervalSeconds;

  logInfo('shop_shipping_job_interval_applied', {
    ...baseMeta,
    jobName: JOB_NAME,
    requestedMinIntervalSeconds,
    effectiveIntervalSeconds,
    wasClamped,
  });

  const gate = await acquireShippingJobSlot({
    jobName: JOB_NAME,
    runId,
    minIntervalSeconds: effectiveIntervalSeconds,
  });

  if (!gate.ok) {
    return shippingJobRateLimitedResponse(gate.nextAllowedAt, requestId);
  }

  try {
    let citiesUpserted = 0;
    let warehousesUpserted = 0;

    if (parsed.data.q) {
      const synced = await cacheSettlementsByQuery({
        q: parsed.data.q,
        limit: parsed.data.limit,
        runId,
      });
      citiesUpserted += synced.upserted;
    }

    if (parsed.data.cityRef) {
      const synced = await cacheWarehousesByCityRef({
        cityRef: parsed.data.cityRef,
        runId,
      });
      warehousesUpserted += synced.upserted;
    }

    return noStoreJson(
      {
        success: true,
        runId,
        citiesUpserted,
        warehousesUpserted,
      },
      requestId,
      200
    );
  } catch (error) {
    logWarn('shop_shipping_np_sync_failed', {
      ...(sanitizeShippingLogMeta(baseMeta) ?? baseMeta),
      code: 'NP_SYNC_FAILED',
    });
    logError(
      'shop_shipping_np_sync_failed_error',
      sanitizeShippingErrorForLog(error, 'NP sync failed.'),
      {
        ...(sanitizeShippingLogMeta(baseMeta) ?? baseMeta),
        code: 'NP_SYNC_FAILED',
      }
    );

    const debug = debugEnabled ? buildSafeDebugPayload(error) : null;

    return noStoreJson(
      {
        success: false,
        code: 'NP_SYNC_FAILED',
        ...(debug ? { debug } : {}),
      },
      requestId,
      503
    );
  }
}
