import 'server-only';

import type { MonobankInvoiceCreateInput } from '@/lib/psp/monobank';

type MinorInput = number | bigint | string | null | undefined;

type MerchantPaymInfoBase = NonNullable<
  MonobankInvoiceCreateInput['merchantPaymInfo']
>;

export type MonoBasketOrderItem = {
  name: string;
  qty: number;
  sum: number;
  total: number;
  unit?: string;
};

export type MonoMerchantPaymInfo = MerchantPaymInfoBase & {
  reference: string;
  destination: string;
  basketOrder: MonoBasketOrderItem[];
};

export type MonoOrderSnapshot = {
  id: string;
  currency: string;
  totalAmountMinor: MinorInput;
  displayLabel?: string | null;
};

export type MonoOrderItemSnapshot = {
  productId?: string | null;
  title?: string | null;
  quantity: MinorInput;
  unitPriceMinor: MinorInput;
  lineTotalMinor: MinorInput;
};

export class MonobankMerchantPaymInfoError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
const ZERO = BigInt(0);

const MAX_NAME_LEN = 128;

function normalizeText(value: string, maxLen: number): string {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (!trimmed) return '';
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen);
}

function shortId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.slice(0, 8);
}

function parseIntegerStrict(
  value: MinorInput,
  field: string,
  opts?: { allowZero?: boolean }
): bigint {
  if (value === null || value === undefined) {
    throw new MonobankMerchantPaymInfoError(
      'MONO_INVALID_SNAPSHOT',
      `${field} is required`
    );
  }

  let parsed: bigint;

  if (typeof value === 'bigint') {
    parsed = value;
  } else if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isSafeInteger(value)) {
      throw new MonobankMerchantPaymInfoError(
        'MONO_INVALID_SNAPSHOT',
        `${field} must be a safe integer`
      );
    }
    parsed = BigInt(value);
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || !/^-?\d+$/.test(trimmed)) {
      throw new MonobankMerchantPaymInfoError(
        'MONO_INVALID_SNAPSHOT',
        `${field} must be an integer string`
      );
    }
    parsed = BigInt(trimmed);
  } else {
    throw new MonobankMerchantPaymInfoError(
      'MONO_INVALID_SNAPSHOT',
      `${field} must be an integer`
    );
  }

  const allowZero = opts?.allowZero ?? false;
  if (allowZero) {
    if (parsed < ZERO) {
      throw new MonobankMerchantPaymInfoError(
        'MONO_INVALID_SNAPSHOT',
        `${field} must be non-negative`
      );
    }
  } else if (parsed <= ZERO) {
    throw new MonobankMerchantPaymInfoError(
      'MONO_INVALID_SNAPSHOT',
      `${field} must be positive`
    );
  }

  return parsed;
}

function toSafeNumber(value: bigint, field: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new MonobankMerchantPaymInfoError(
      'MONO_INVALID_SNAPSHOT',
      `${field} exceeds MAX_SAFE_INTEGER`
    );
  }
  return Number(value);
}

function buildDestination(order: MonoOrderSnapshot): string {
  const label = normalizeText(order.displayLabel ?? '', 32);
  const fallback = shortId(order.id) || normalizeText(order.id, 32);
  return normalizeText(`Оплата замовлення ${label || fallback}`, MAX_NAME_LEN);
}

function buildItemName(item: MonoOrderItemSnapshot): string {
  const title = normalizeText(item.title ?? '', MAX_NAME_LEN);
  if (title) return title;
  const fallbackId = item.productId ? shortId(item.productId) : '';
  return normalizeText(
    fallbackId ? `Item ${fallbackId}` : 'Item',
    MAX_NAME_LEN
  );
}

export function buildMonoMerchantPaymInfoFromSnapshot(args: {
  reference: string;
  order: MonoOrderSnapshot;
  items: MonoOrderItemSnapshot[];
  expectedAmountMinor?: MinorInput;
}): MonoMerchantPaymInfo {
  if (!args.reference || !args.reference.trim()) {
    throw new MonobankMerchantPaymInfoError(
      'MONO_INVALID_SNAPSHOT',
      'reference is required'
    );
  }

  const currency = args.order.currency?.toUpperCase?.() ?? '';
  if (currency !== 'UAH') {
    throw new MonobankMerchantPaymInfoError(
      'MONO_UAH_ONLY',
      'Monobank requires UAH currency'
    );
  }

  const orderTotal = parseIntegerStrict(
    args.order.totalAmountMinor,
    'order.totalAmountMinor'
  );
  const expected = parseIntegerStrict(
    args.expectedAmountMinor ?? args.order.totalAmountMinor,
    'expectedAmountMinor'
  );

  if (expected !== orderTotal) {
    throw new MonobankMerchantPaymInfoError(
      'MONO_INVALID_SNAPSHOT',
      'Order total mismatch'
    );
  }

  let basketSum = ZERO;
  const basketOrder: MonoBasketOrderItem[] = args.items.map(item => {
    const qty = parseIntegerStrict(item.quantity, 'item.quantity');
    const unitPrice = parseIntegerStrict(
      item.unitPriceMinor,
      'item.unitPriceMinor'
    );
    const lineTotal = parseIntegerStrict(
      item.lineTotalMinor,
      'item.lineTotalMinor'
    );

    if (unitPrice * qty !== lineTotal) {
      throw new MonobankMerchantPaymInfoError(
        'MONO_INVALID_SNAPSHOT',
        'Line total mismatch'
      );
    }

    basketSum += lineTotal;

    return {
      name: buildItemName(item),
      qty: toSafeNumber(qty, 'item.quantity'),
      sum: toSafeNumber(unitPrice, 'item.unitPriceMinor'),
      total: toSafeNumber(lineTotal, 'item.lineTotalMinor'),
      unit: 'шт.',
    };
  });

  if (basketSum !== expected) {
    throw new MonobankMerchantPaymInfoError(
      'MONO_BASKET_SUM_MISMATCH',
      'Basket total does not match expected amount'
    );
  }

  return {
    reference: args.reference.trim(),
    destination: buildDestination(args.order),
    basketOrder,
  };
}
