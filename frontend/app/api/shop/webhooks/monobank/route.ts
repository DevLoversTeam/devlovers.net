import 'server-only';

import crypto from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { getMonobankConfig } from '@/lib/env/monobank';
import { logError, logInfo, logWarn } from '@/lib/logging';
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

  let rawBodyBytes: Buffer;
  try {
    rawBodyBytes = Buffer.from(await request.arrayBuffer());
  } catch (error) {
    logError('monobank_webhook_body_read_failed', error, {
      ...baseMeta,
      code: 'MONO_BODY_READ_FAILED',
    });
    return noStoreJson({ ok: true }, { status: 200 });
  }

  const rawSha256 = crypto
    .createHash('sha256')
    .update(rawBodyBytes)
    .digest('hex');
  const eventKey = rawSha256;
  const signature = request.headers.get('x-sign');

  let validSignature = false;
  try {
    validSignature = await verifyWebhookSignatureWithRefresh({
      rawBodyBytes,
      signature,
    });
  } catch (error) {
    logError('monobank_webhook_signature_error', error, {
      ...baseMeta,
      code: 'MONO_SIG_INVALID',
      rawSha256,
    });
  }

  if (!validSignature) {
    logWarn('monobank_webhook_signature_invalid', {
      ...baseMeta,
      code: 'MONO_SIG_INVALID',
      rawSha256,
    });
    return noStoreJson({ ok: true }, { status: 200 });
  }

  const parsedPayload = parseWebhookPayload(rawBodyBytes);
  if (!parsedPayload) {
    logWarn('monobank_webhook_payload_invalid', {
      ...baseMeta,
      code: 'INVALID_PAYLOAD',
      eventKey,
      rawSha256,
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

    logInfo('monobank_webhook_processed', {
      ...baseMeta,
      eventKey,
      rawSha256,
      invoiceId: result.invoiceId,
      appliedResult: result.appliedResult,
      deduped: result.deduped,
    });
  } catch (error) {
    logError('monobank_webhook_apply_failed', error, {
      ...baseMeta,
      code: 'WEBHOOK_APPLY_FAILED',
      eventKey,
      rawSha256,
    });
  }

  return noStoreJson({ ok: true }, { status: 200 });
}
