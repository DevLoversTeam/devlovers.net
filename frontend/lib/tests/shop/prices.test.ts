<<<<<<< HEAD
import { describe, expect, it } from "vitest";
import { adminPriceRowSchema } from "../../validation/shop";

describe("pricing validation", () => {
  it("rejects originalPriceMinor == priceMinor (SALE must be strict)", () => {
    const r = adminPriceRowSchema.safeParse({
      currency: "USD",
=======
import { describe, expect, it } from 'vitest';

import { adminPriceRowSchema } from '../../validation/shop';

describe('pricing validation', () => {
  it('rejects originalPriceMinor == priceMinor (SALE must be strict)', () => {
    const r = adminPriceRowSchema.safeParse({
      currency: 'USD',
>>>>>>> 601e032c399164dfc128ab2dee5fe52dd66d2caf
      priceMinor: 1000,
      originalPriceMinor: 1000,
    });

    expect(r.success).toBe(false);
  });

<<<<<<< HEAD
  it("accepts originalPriceMinor > priceMinor", () => {
    const r = adminPriceRowSchema.safeParse({
      currency: "USD",
=======
  it('accepts originalPriceMinor > priceMinor', () => {
    const r = adminPriceRowSchema.safeParse({
      currency: 'USD',
>>>>>>> 601e032c399164dfc128ab2dee5fe52dd66d2caf
      priceMinor: 1000,
      originalPriceMinor: 1200,
    });

    expect(r.success).toBe(true);
  });
});
<<<<<<< HEAD

=======
>>>>>>> 601e032c399164dfc128ab2dee5fe52dd66d2caf
