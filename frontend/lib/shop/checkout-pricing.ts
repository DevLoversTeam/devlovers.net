import crypto from 'node:crypto';

import type { CurrencyCode } from '@/lib/shop/currency';

type CheckoutPricingFingerprintItem = {
  productId: string;
  quantity: number;
  unitPriceMinor: number;
  selectedSize?: string | null;
  selectedColor?: string | null;
};

function normalizeVariant(value: string | null | undefined): string {
  return (value ?? '').trim();
}

export function createCheckoutPricingFingerprint(args: {
  currency: CurrencyCode;
  items: CheckoutPricingFingerprintItem[];
}): string {
  const normalizedItems = [...args.items]
    .map(item => ({
      productId: item.productId,
      quantity: item.quantity,
      unitPriceMinor: item.unitPriceMinor,
      selectedSize: normalizeVariant(item.selectedSize),
      selectedColor: normalizeVariant(item.selectedColor),
    }))
    .sort((a, b) => {
      const aKey = JSON.stringify(a);
      const bKey = JSON.stringify(b);
      return aKey.localeCompare(bKey);
    });

  const payload = JSON.stringify({
    v: 1,
    currency: args.currency,
    items: normalizedItems,
  });

  return crypto.createHash('sha256').update(payload).digest('hex');
}
