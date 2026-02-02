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
  });
});
