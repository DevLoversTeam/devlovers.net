import 'server-only';

import crypto from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { getMonobankConfig } from '@/lib/env/monobank';
import { logError, logInfo, logWarn } from '@/lib/logging';
import {
  MONO_SIG_INVALID,
  MONO_STORE_MODE,
  monoLogError,
  monoLogInfo,
  monoLogWarn,
  monoSha256Raw,
} from '@/lib/logging/monobank';
import { verifyWebhookSignatureWithRefresh } from '@/lib/psp/monobank';
import { handleMonobankWebhook } from '@/lib/services/orders/monobank-webhook';

export const dynamic = 'force-dynamic';

type WebhookMode = 'drop' | 'store' | 'apply';

function parseWebhookMode(raw: unknown): WebhookMode {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (v === 'drop' || v === 'store' || v === 'apply') return v;
  return 'apply';
}

function noStoreJson(body: unknown, init?: { status?: number }) {
  const res = NextResponse.json(body, { status: init?.status ?? 200 });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

function parseWebhookPayload(
  rawBodyBytes: Buffer
): Record<string, unknown> | null {
  const rawBody = rawBodyBytes.toString('utf8').replace(/^\uFEFF/, '');

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }

  return parsed as Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  const requestId =
    request.headers.get('x-request-id')?.trim() || crypto.randomUUID();
  const signature = request.headers.get('x-sign');
  const hasXSign = typeof signature === 'string' && signature.trim().length > 0;

  const baseMeta = {
    requestId,
    route: request.nextUrl.pathname,
    method: request.method,
  };

  let webhookMode: WebhookMode = parseWebhookMode(
    process.env.MONO_WEBHOOK_MODE
  );
  if (!process.env.MONO_WEBHOOK_MODE) {
    try {
      webhookMode = parseWebhookMode(getMonobankConfig().webhookMode);
    } catch (error) {
      logError('monobank_webhook_mode_invalid', error, {
        ...baseMeta,
        code: 'MONO_WEBHOOK_MODE_INVALID',
      });
      webhookMode = 'apply';
    }
  }
  monoLogInfo(MONO_STORE_MODE, {
    ...baseMeta,
    mode: webhookMode,
    storeDecision: webhookMode,
  });

  let rawBodyBytes: Buffer;
  try {
    rawBodyBytes = Buffer.from(await request.arrayBuffer());
  } catch (error) {
    logError('monobank_webhook_body_read_failed', error, {
      ...baseMeta,
      mode: webhookMode,
      hasXSign,
      rawBytesLen: 0,
      reason: 'BODY_READ_FAILED',
      code: 'MONO_BODY_READ_FAILED',
    });
    return noStoreJson({ ok: true }, { status: 200 });
  }

  const rawSha256 = monoSha256Raw(rawBodyBytes);
  const rawBytesLen = rawBodyBytes.byteLength;
  const eventKey = rawSha256;
  const diagMeta = {
    ...baseMeta,
    mode: webhookMode,
    hasXSign,
    rawSha256,
    rawBytesLen,
  };

  let validSignature = false;
  try {
    validSignature = await verifyWebhookSignatureWithRefresh({
      rawBodyBytes,
      signature,
    });
  } catch (error) {
    monoLogError(MONO_SIG_INVALID, error, {
      ...diagMeta,
      reason: 'SIG_VERIFY_ERROR',
    });
  }

  if (!validSignature) {
    monoLogWarn(MONO_SIG_INVALID, {
      ...diagMeta,
      reason: 'SIG_INVALID',
    });
    return noStoreJson({ ok: true }, { status: 200 });
  }

  const parsedPayload = parseWebhookPayload(rawBodyBytes);
  if (!parsedPayload) {
    logWarn('monobank_webhook_payload_invalid', {
      ...diagMeta,
      code: 'INVALID_PAYLOAD',
      eventKey,
      reason: 'INVALID_PAYLOAD',
    });
    return noStoreJson({ ok: true }, { status: 200 });
  }

  try {
    const result = await handleMonobankWebhook({
      rawBodyBytes,
      parsedPayload,
      eventKey,
      requestId,
      mode: webhookMode,
    });

    if (result.appliedResult === 'stored' || result.appliedResult === 'dropped') {
      monoLogInfo(MONO_STORE_MODE, {
        ...diagMeta,
        mode: webhookMode,
        storeDecision: result.appliedResult,
        eventKey,
        invoiceId: result.invoiceId,
        reason: 'STORE_MODE_RESULT',
      });
    }

    logInfo('monobank_webhook_processed', {
      ...diagMeta,
      eventKey,
      invoiceId: result.invoiceId,
      appliedResult: result.appliedResult,
      deduped: result.deduped,
      reason: 'PROCESSED',
    });
  } catch (error) {
    logError('monobank_webhook_apply_failed', error, {
      ...diagMeta,
      code: 'WEBHOOK_APPLY_FAILED',
      eventKey,
      reason: 'WEBHOOK_APPLY_FAILED',
    });
  }

  return noStoreJson({ ok: true }, { status: 200 });
}
