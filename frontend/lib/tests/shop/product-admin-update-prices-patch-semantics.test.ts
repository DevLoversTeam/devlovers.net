import { describe, expect, it } from 'vitest';
import { productAdminUpdateSchema } from '@/lib/validation/shop';

describe('productAdminUpdateSchema: prices PATCH semantics', () => {
  it('allows partial prices update without USD', () => {
    const res = productAdminUpdateSchema.safeParse({
      prices: [
        { currency: 'UAH', priceMinor: 1000, originalPriceMinor: 2000 },
      ],
    });

    expect(res.success).toBe(true);
  });

  it('still rejects duplicate currencies', () => {
    const res = productAdminUpdateSchema.safeParse({
      prices: [
        { currency: 'UAH', priceMinor: 1000, originalPriceMinor: 2000 },
        { currency: 'UAH', priceMinor: 1500, originalPriceMinor: 2500 },
      ],
    });

    expect(res.success).toBe(false);
  });

  it('requires originalPriceMinor for provided rows when badge=SALE and prices provided', () => {
    const res = productAdminUpdateSchema.safeParse({
      badge: 'SALE',
      prices: [{ currency: 'UAH', priceMinor: 1000 }],
    });

    expect(res.success).toBe(false);
  });
});
