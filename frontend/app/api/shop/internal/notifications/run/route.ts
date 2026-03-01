import crypto from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { requireInternalJanitorAuth } from '@/lib/auth/internal-janitor';
import { logError, logWarn } from '@/lib/logging';
import { guardNonBrowserFailClosed } from '@/lib/security/origin';
import {
  countRunnableNotificationOutboxRows,
  runNotificationOutboxWorker,
} from '@/lib/services/shop/notifications/outbox-worker';
import { runNotificationOutboxProjector } from '@/lib/services/shop/notifications/projector';
import { internalNotificationsRunPayloadSchema } from '@/lib/validation/shop-notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const ROUTE_PATH = '/api/shop/internal/notifications/run';

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
  const requestId =
    request.headers.get('x-request-id')?.trim() || crypto.randomUUID();
  const runId = crypto.randomUUID();
  const baseMeta = {
    requestId,
    runId,
    route: ROUTE_PATH,
    method: request.method,
  };

  const blocked = guardNonBrowserFailClosed(request, {
    surface: 'shop_notifications_worker',
  });
  if (blocked) {
    blocked.headers.set('X-Request-Id', requestId);
    blocked.headers.set('Cache-Control', 'no-store');
    return blocked;
  }

  const authRes = requireInternalJanitorAuth(request);
  if (authRes) {
    authRes.headers.set('X-Request-Id', requestId);
    authRes.headers.set('Cache-Control', 'no-store');
    return authRes;
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

  const parsed = internalNotificationsRunPayloadSchema.safeParse(rawBody);
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

  const payload = parsed.data;

  try {
    const projected = await runNotificationOutboxProjector({
      limit: payload.projectorLimit,
    });

    if (payload.dryRun) {
      const runnable = await countRunnableNotificationOutboxRows();
      return noStoreJson(
        {
          success: true,
          dryRun: true,
          runId,
          projector: projected,
          runnable,
        },
        requestId,
        200
      );
    }

    const workerResult = await runNotificationOutboxWorker({
      runId,
      limit: payload.limit,
      leaseSeconds: payload.leaseSeconds,
      maxAttempts: payload.maxAttempts,
      baseBackoffSeconds: payload.baseBackoffSeconds,
    });

    return noStoreJson(
      {
        success: true,
        dryRun: false,
        runId,
        projector: projected,
        worker: workerResult,
      },
      requestId,
      200
    );
  } catch (error) {
    logWarn('shop_notifications_worker_failed', {
      ...baseMeta,
      code: 'SHOP_NOTIFICATIONS_WORKER_FAILED',
    });
    logError('shop_notifications_worker_failed_error', error, {
      ...baseMeta,
      code: 'SHOP_NOTIFICATIONS_WORKER_FAILED',
    });

    return noStoreJson(
      {
        success: false,
        code: 'INTERNAL_ERROR',
      },
      requestId,
      500
    );
  }
}
