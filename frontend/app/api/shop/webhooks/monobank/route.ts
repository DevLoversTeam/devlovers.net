import 'server-only';

import crypto from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { getMonobankConfig } from '@/lib/env/monobank';
import { logError, logInfo, logWarn } from '@/lib/logging';
import { verifyMonobankWebhookSignature } from '@/lib/psp/monobank';
import { InvalidPayloadError } from '@/lib/services/errors';
import { applyMonoWebhookEvent } from '@/lib/services/orders/monobank-webhook';

export const dynamic = 'force-dynamic';

function noStoreJson(body: unknown, init?: { status?: number }) {
  const res = NextResponse.json(body, { status: init?.status ?? 200 });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

export async function POST(request: NextRequest) {
  const requestId =
    request.headers.get('x-request-id')?.trim() || crypto.randomUUID();

  const baseMeta = {
    requestId,
    route: request.nextUrl.pathname,
    method: request.method,
  };

  const rawBody = await request.text();
  const signature =
    request.headers.get('x-sign') ?? request.headers.get('x-signature');

  let validSignature = false;
  try {
    validSignature = await verifyMonobankWebhookSignature({
      rawBody,
      signature,
    });
  } catch (error) {
    logError('monobank_webhook_signature_error', error, {
      ...baseMeta,
      code: 'SIGNATURE_ERROR',
    });
  }

  if (!validSignature) {
    logWarn('monobank_webhook_signature_invalid', {
      ...baseMeta,
      code: 'INVALID_SIGNATURE',
    });
    return noStoreJson({ code: 'INVALID_SIGNATURE' }, { status: 401 });
  }

  const rawMode = (process.env.MONO_WEBHOOK_MODE ?? '').trim().toLowerCase();
  const webhookMode: 'drop' | 'store' | 'apply' =
    rawMode === 'store' || rawMode === 'apply' || rawMode === 'drop'
      ? (rawMode as 'drop' | 'store' | 'apply')
      : 'drop';

  if (rawMode && webhookMode === 'drop' && rawMode !== 'drop') {
    logWarn('monobank_webhook_mode_invalid', {
      ...baseMeta,
      code: 'MONO_WEBHOOK_MODE_INVALID',
      rawMode,
    });
  }

  try {
    const result = await applyMonoWebhookEvent({
      rawBody,
      requestId,
      mode: webhookMode,
    });

    if (result.appliedResult === 'deduped') {
      logInfo('monobank_webhook_deduped', {
        ...baseMeta,
        invoiceId: result.invoiceId,
      });
    }

    if (result.appliedResult === 'stored') {
      logInfo('monobank_webhook_stored', {
        ...baseMeta,
        invoiceId: result.invoiceId,
      });
    }

    if (result.appliedResult === 'dropped') {
      logInfo('monobank_webhook_dropped', {
        ...baseMeta,
        invoiceId: result.invoiceId,
      });
    }

    return noStoreJson({ ok: true }, { status: 200 });
  } catch (error) {
    if (error instanceof InvalidPayloadError) {
      logWarn('monobank_webhook_invalid_payload', {
        ...baseMeta,
        code: error.code,
        message: error.message,
      });
      return noStoreJson({ code: error.code }, { status: 400 });
    }

    logError('monobank_webhook_apply_failed', error, {
      ...baseMeta,
      code: 'WEBHOOK_APPLY_FAILED',
    });

    return noStoreJson({ code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
