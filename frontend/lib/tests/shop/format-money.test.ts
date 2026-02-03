<<<<<<< HEAD
import { describe, expect, it } from "vitest";
import { formatMoney } from "@/lib/shop/currency";

describe("formatMoney", () => {
  it("formats USD with $ for en", () => {
    const s = formatMoney(1999, "USD", "en");
    expect(s).toContain("$");
  });

  it("formats UAH with ₴ for uk", () => {
    const s = formatMoney(1999, "UAH", "uk");
    expect(s).toContain("₴");
=======
import { describe, expect, it } from 'vitest';

import { formatMoney } from '@/lib/shop/currency';

describe('formatMoney', () => {
  it('formats USD with $ for en', () => {
    const s = formatMoney(1999, 'USD', 'en');
    expect(s).toContain('$');
  });

  it('formats UAH with ₴ for uk', () => {
    const s = formatMoney(1999, 'UAH', 'uk');
    expect(s).toContain('₴');
>>>>>>> 601e032c399164dfc128ab2dee5fe52dd66d2caf
  });
});
