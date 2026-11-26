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
import { anonymizeRetainedOrderShippingSnapshots } from '@/lib/services/shop/shipping/retention';
import {
  getInternalShippingMinIntervalFloorSeconds,
  internalShippingRetentionRunPayloadSchema,
} from '@/lib/validation/shop-shipping';

import {
  acquireShippingJobSlot,
  shippingJobRateLimitedResponse,
} from '../../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const ROUTE_PATH = '/api/shop/internal/shipping/retention/run';
const JOB_NAME = 'shipping-retention-run';
function isLocalBypassEnabled(): boolean {
  const appEnv = String(process.env.APP_ENV ?? '').toLowerCase();
  const nodeEnv = String(process.env.NODE_ENV ?? '').toLowerCase();
  const disabled = String(process.env.RATE_LIMIT_DISABLED ?? '').toLowerCase();

  return (
    appEnv === 'local' ||
    nodeEnv === 'development' ||
    disabled === 'true' ||
    disabled === '1'
  );
}

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
  const safeBaseMeta = sanitizeShippingLogMeta(baseMeta) ?? baseMeta;

  const blocked = guardNonBrowserFailClosed(request, {
    surface: 'shop_shipping_retention',
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
  if (!flags.shippingEnabled || !flags.retentionEnabled) {
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

  const parsed = internalShippingRetentionRunPayloadSchema.safeParse(rawBody);
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
    ...safeBaseMeta,
    jobName: JOB_NAME,
    requestedMinIntervalSeconds,
    effectiveIntervalSeconds,
    wasClamped,
  });

  const bypass = isLocalBypassEnabled();

  const gate = bypass
    ? ({ ok: true as const } as const)
    : await acquireShippingJobSlot({
        jobName: JOB_NAME,
        runId,
        minIntervalSeconds: effectiveIntervalSeconds,
      });

  if (!gate.ok) {
    return shippingJobRateLimitedResponse(gate.nextAllowedAt, requestId);
  }

  const retentionDays = parsed.data.retentionDays ?? flags.retentionDays;

  try {
    const result = await anonymizeRetainedOrderShippingSnapshots({
      runId,
      retentionDays,
      batchSize: parsed.data.batchSize,
    });

    return noStoreJson(
      {
        success: true,
        runId,
        retentionDays,
        batchSize: parsed.data.batchSize,
        processed: result.processed,
      },
      requestId,
      200
    );
  } catch (error) {
    logWarn(
      'shop_shipping_retention_failed',
      sanitizeShippingLogMeta({
        ...safeBaseMeta,
        code: 'RETENTION_FAILED',
      })
    );
    logError(
      'shop_shipping_retention_failed_error',
      sanitizeShippingErrorForLog(error, 'Shipping retention run failed.'),
      sanitizeShippingLogMeta({
        ...safeBaseMeta,
        code: 'RETENTION_FAILED',
      })
    );
    return noStoreJson(
      {
        success: false,
        code: 'RETENTION_FAILED',
      },
      requestId,
      500
    );
  }
}
