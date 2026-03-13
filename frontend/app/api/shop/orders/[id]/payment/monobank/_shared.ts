import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/db';
import { orders } from '@/db/schema';
import { toDbMoney } from '@/lib/shop/money';
import type { PaymentMethod } from '@/lib/shop/payments';

const ORDER_PAYABLE_STATUSES = new Set(['pending', 'requires_payment']);

type OrderPaymentRow = {
  id: string;
  paymentProvider: string;
  paymentStatus: string;
  currency: string;
  totalAmountMinor: number;
  pspPaymentMethod: string | null;
  pspMetadata: Record<string, unknown> | null;
};

export function noStoreJson(body: unknown, status = 200) {
  const res = NextResponse.json(body, { status });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

export function isMonobankGooglePayEnabled(): boolean {
  const raw = (process.env.SHOP_MONOBANK_GPAY_ENABLED ?? '')
    .trim()
    .toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on';
}

export function getMonobankGooglePayMaxBodyBytes(): number {
  const fallback = 16 * 1024;
  const raw = (process.env.SHOP_MONOBANK_GPAY_MAX_BODY_BYTES ?? '').trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export async function readOrderPaymentRow(
  orderId: string
): Promise<OrderPaymentRow | null> {
  const rows = await db
    .select({
      id: orders.id,
      paymentProvider: orders.paymentProvider,
      paymentStatus: orders.paymentStatus,
      currency: orders.currency,
      totalAmountMinor: orders.totalAmountMinor,
      pspPaymentMethod: orders.pspPaymentMethod,
      pspMetadata: orders.pspMetadata,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  return rows[0] ?? null;
}

function parseKnownMethod(value: unknown): PaymentMethod | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'stripe_card') return 'stripe_card';
  if (normalized === 'monobank_invoice') return 'monobank_invoice';
  if (normalized === 'monobank_google_pay') return 'monobank_google_pay';
  return null;
}

export function readResolvedOrderPaymentMethod(
  order: Pick<OrderPaymentRow, 'pspPaymentMethod' | 'pspMetadata'>
): PaymentMethod | null {
  const direct = parseKnownMethod(order.pspPaymentMethod);
  if (direct) return direct;

  const checkout =
    order.pspMetadata &&
    typeof order.pspMetadata === 'object' &&
    !Array.isArray(order.pspMetadata)
      ? ((order.pspMetadata.checkout as Record<string, unknown> | undefined) ??
        null)
      : null;
  if (!checkout || typeof checkout !== 'object') return null;

  return parseKnownMethod(checkout.requestedMethod);
}

export function ensureMonobankPayableOrder(args: {
  order: OrderPaymentRow;
  allowedMethods: PaymentMethod[];
}) {
  const { order, allowedMethods } = args;

  if (order.paymentProvider !== 'monobank') {
    return {
      ok: false as const,
      status: 409,
      code: 'PAYMENT_PROVIDER_NOT_ALLOWED',
      message: 'Order payment provider is not Monobank.',
    };
  }

  if (order.currency !== 'UAH') {
    return {
      ok: false as const,
      status: 409,
      code: 'ORDER_CURRENCY_NOT_SUPPORTED',
      message: 'Order currency must be UAH.',
    };
  }

  if (!ORDER_PAYABLE_STATUSES.has(order.paymentStatus)) {
    return {
      ok: false as const,
      status: 409,
      code: 'ORDER_NOT_PAYABLE',
      message: 'Order is not payable in the current state.',
    };
  }

  if (
    !Number.isSafeInteger(order.totalAmountMinor) ||
    order.totalAmountMinor <= 0
  ) {
    return {
      ok: false as const,
      status: 409,
      code: 'ORDER_TOTAL_INVALID',
      message: 'Order total is invalid.',
    };
  }

  const method = readResolvedOrderPaymentMethod(order);
  if (!method || !allowedMethods.includes(method)) {
    return {
      ok: false as const,
      status: 409,
      code: 'PAYMENT_METHOD_NOT_ALLOWED',
      message: 'Order payment method is not compatible with this endpoint.',
    };
  }

  return { ok: true as const, method };
}

export function formatMinorToDecimalString(minor: number): string {
  return toDbMoney(minor);
}
