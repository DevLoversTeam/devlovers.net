import crypto from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { requireInternalJanitorAuth } from '@/lib/auth/internal-janitor';
import {
  getNovaPoshtaConfig,
  getShopShippingFlags,
  NovaPoshtaConfigError,
} from '@/lib/env/nova-poshta';
import { getRequestId } from '@/lib/http/getRequestId';
import { logError, logInfo, logWarn } from '@/lib/logging';
import { guardNonBrowserFailClosed } from '@/lib/security/origin';
import {
  sanitizeShippingErrorForLog,
  sanitizeShippingLogMeta,
} from '@/lib/services/shop/shipping/log-sanitizer';
import { runShippingShipmentsWorker } from '@/lib/services/shop/shipping/shipments-worker';
import {
  getInternalShippingMinIntervalFloorSeconds,
  internalShippingShipmentsRunPayloadSchema,
} from '@/lib/validation/shop-shipping';

import {
  acquireShippingJobSlot,
  shippingJobRateLimitedResponse,
} from '../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const ROUTE_PATH = '/api/shop/internal/shipping/shipments/run';
const JOB_NAME = 'shipping-shipments-run';

function noStoreJson(body: unknown, requestId: string, status = 200) {
  const res = NextResponse.json(body, { status });
  res.headers.set('Cache-Control', 'no-store');
  res.headers.set('X-Request-Id', requestId);
  return res;
}

async function readJsonBodyOrDefault(request: NextRequest): Promise<unknown> {
  const raw = await request.text();
  if (!raw.trim()) return {};
  return JSON.parse(raw);
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

  const blocked = guardNonBrowserFailClosed(request, {
    surface: 'shop_shipping_shipments_worker',
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
  if (!flags.shippingEnabled || !flags.npEnabled) {
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
    rawBody = await readJsonBodyOrDefault(request);
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

  const parsed = internalShippingShipmentsRunPayloadSchema.safeParse(rawBody);
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
  const floorSeconds = getInternalShippingMinIntervalFloorSeconds();
  const effectiveIntervalSeconds = Math.max(
    floorSeconds,
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
    getNovaPoshtaConfig();
  } catch (error) {
    if (error instanceof NovaPoshtaConfigError) {
      logWarn('shipping_shipments_worker_np_config_error', {
        ...(sanitizeShippingLogMeta(baseMeta) ?? baseMeta),
        code: 'NP_CONFIG_ERROR',
      });
      return noStoreJson(
        {
          success: false,
          code: 'NP_CONFIG_ERROR',
        },
        requestId,
        503
      );
    }
    throw error;
  }

  try {
    const result = await runShippingShipmentsWorker({
      runId,
      leaseSeconds: parsed.data.leaseSeconds,
      limit: parsed.data.limit,
      maxAttempts: parsed.data.maxAttempts,
      baseBackoffSeconds: parsed.data.baseBackoffSeconds,
    });

    return noStoreJson(
      {
        success: true,
        runId,
        ...result,
      },
      requestId,
      200
    );
  } catch (error) {
    logWarn('shipping_shipments_worker_failed', {
      ...(sanitizeShippingLogMeta(baseMeta) ?? baseMeta),
      code: 'SHIPPING_WORKER_FAILED',
    });
    logError(
      'shipping_shipments_worker_failed_error',
      sanitizeShippingErrorForLog(error, 'Shipping shipments worker failed.'),
      {
        ...(sanitizeShippingLogMeta(baseMeta) ?? baseMeta),
        code: 'SHIPPING_WORKER_FAILED',
      }
    );

    return noStoreJson(
      {
        success: false,
        code: 'SHIPPING_WORKER_FAILED',
      },
      requestId,
      500
    );
  }
}
