import {
  buildMonoMerchantPaymInfoFromSnapshot,
  MonobankMerchantPaymInfoError,
  type MonoBasketOrderItem,
  type MonoMerchantPaymInfo,
} from '@/lib/psp/monobank/merchant-paym-info';
import type { CurrencyCode } from '@/lib/shop/currency';

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

function safeLineTotalMinor(qty: unknown, unit: unknown): number {
  if (
    typeof qty !== 'number' ||
    typeof unit !== 'number' ||
    !Number.isFinite(qty) ||
    !Number.isFinite(unit) ||
    !Number.isInteger(qty) ||
    !Number.isInteger(unit)
  ) {
    return 0;
  }
  if (qty <= 0 || unit < 0) return 0;

  const total = BigInt(qty) * BigInt(unit);
  if (total > MAX_SAFE) return 0;

  return Number(total);
}

export type MonoMerchantPaymInfoInput = {
  reference: string;
  destination: string;
  currency: CurrencyCode;
  expectedAmountMinor: number;
  items: Array<{
    name: string;
    quantity: number;
    unitPriceMinor: number;
  }>;
};

export type { MonoBasketOrderItem, MonoMerchantPaymInfo };
export { MonobankMerchantPaymInfoError as MonoMerchantPaymInfoError };

export function buildMonoMerchantPaymInfo(
  input: MonoMerchantPaymInfoInput
): MonoMerchantPaymInfo {
  const mapped = buildMonoMerchantPaymInfoFromSnapshot({
    reference: input.reference,
    order: {
      id: input.reference,
      currency: input.currency,
      totalAmountMinor: input.expectedAmountMinor,
      displayLabel: input.destination,
    },
    items: input.items.map(item => ({
      title: item.name,
      quantity: item.quantity,
      unitPriceMinor: item.unitPriceMinor,
      lineTotalMinor: safeLineTotalMinor(item.quantity, item.unitPriceMinor),
    })),
    expectedAmountMinor: input.expectedAmountMinor,
  });

  const destination = input.destination.trim();
  return {
    ...mapped,
    destination: destination || mapped.destination,
  };
}
