import 'server-only';

import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { orders, paymentAttempts } from '@/db/schema';
import { logError, logInfo, logWarn } from '@/lib/logging';
import { verifyMonobankWebhookSignature } from '@/lib/psp/monobank';
import { guardedPaymentStatusUpdate } from '@/lib/services/orders/payment-state';
import { restockOrder } from '@/lib/services/orders/restock';

export const dynamic = 'force-dynamic';

function noStoreJson(body: unknown, init?: { status?: number }) {
  const res = NextResponse.json(body, { status: init?.status ?? 200 });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

type MonobankWebhookPayload = {
  invoiceId?: string;
  status?: string;
  amount?: number;
  ccy?: number;
  reference?: string;
};

function normalizeStatus(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().toLowerCase();
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

  let payload: MonobankWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as MonobankWebhookPayload;
  } catch (error) {
    logWarn('monobank_webhook_invalid_json', {
      ...baseMeta,
      code: 'INVALID_PAYLOAD',
      message: error instanceof Error ? error.message : String(error),
    });
    return noStoreJson({ code: 'INVALID_PAYLOAD' }, { status: 400 });
  }

  const invoiceId = typeof payload.invoiceId === 'string' ? payload.invoiceId : '';
  const status = normalizeStatus(payload.status);

  if (!invoiceId || !status) {
    logWarn('monobank_webhook_missing_fields', {
      ...baseMeta,
      code: 'INVALID_PAYLOAD',
      invoiceIdPresent: Boolean(invoiceId),
      status,
    });
    return noStoreJson({ code: 'INVALID_PAYLOAD' }, { status: 400 });
  }

  const [attempt] = await db
    .select({
      id: paymentAttempts.id,
      orderId: paymentAttempts.orderId,
      status: paymentAttempts.status,
    })
    .from(paymentAttempts)
    .where(
      and(
        eq(paymentAttempts.providerPaymentIntentId, invoiceId),
        eq(paymentAttempts.provider, 'monobank')
      )
    )
    .limit(1);

  if (!attempt) {
    logWarn('monobank_webhook_unknown_invoice', {
      ...baseMeta,
      code: 'INVOICE_NOT_FOUND',
      invoiceId,
      status,
    });
    return noStoreJson({ ok: true }, { status: 200 });
  }

  const orderId = attempt.orderId;

  const metadata = {
    monobank: {
      invoiceId,
      status,
      amount: payload.amount ?? null,
      ccy: payload.ccy ?? null,
      reference: payload.reference ?? null,
    },
  };

  if (status === 'success') {
    const res = await guardedPaymentStatusUpdate({
      orderId,
      paymentProvider: 'monobank',
      to: 'paid',
      source: 'monobank_webhook',
      set: {
        status: 'PAID',
        pspMetadata: metadata,
        updatedAt: new Date(),
      },
    });

    await db
      .update(paymentAttempts)
      .set({
        status: 'succeeded',
        finalizedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(paymentAttempts.id, attempt.id));

    logInfo('monobank_webhook_paid', {
      ...baseMeta,
      orderId,
      invoiceId,
      applied: res.applied,
      status,
    });

    return noStoreJson({ ok: true }, { status: 200 });
  }

  if (status === 'processing' || status === 'created') {
    return noStoreJson({ ok: true }, { status: 200 });
  }

  const terminalFailed = status === 'failure' || status === 'expired';
  const terminalRefunded = status === 'reversed';

  if (terminalFailed || terminalRefunded) {
    const toStatus = terminalRefunded ? 'refunded' : 'failed';
    const res = await guardedPaymentStatusUpdate({
      orderId,
      paymentProvider: 'monobank',
      to: toStatus,
      source: 'monobank_webhook',
      set: {
        pspStatusReason: status,
        pspMetadata: metadata,
        updatedAt: new Date(),
      },
    });

    await db
      .update(paymentAttempts)
      .set({
        status: terminalRefunded ? 'canceled' : 'failed',
        finalizedAt: new Date(),
        updatedAt: new Date(),
        lastErrorCode: status,
        lastErrorMessage: `Monobank status: ${status}`,
      })
      .where(eq(paymentAttempts.id, attempt.id));

    try {
      await restockOrder(orderId, {
        reason: terminalRefunded ? 'refunded' : 'failed',
        workerId: 'monobank_webhook',
      });
    } catch (error) {
      logError('monobank_webhook_restock_failed', error, {
        ...baseMeta,
        orderId,
        invoiceId,
        status,
      });
    }

    logInfo('monobank_webhook_terminal', {
      ...baseMeta,
      orderId,
      invoiceId,
      status,
      applied: res.applied,
    });

    return noStoreJson({ ok: true }, { status: 200 });
  }

  logWarn('monobank_webhook_status_ignored', {
    ...baseMeta,
    orderId,
    invoiceId,
    status,
  });

  return noStoreJson({ ok: true }, { status: 200 });
}
