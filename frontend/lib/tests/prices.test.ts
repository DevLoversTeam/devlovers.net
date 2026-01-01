import { describe, expect, it } from "vitest";
import { adminPriceRowSchema } from "../validation/shop";

describe("pricing validation", () => {
  it("rejects originalPriceMinor == priceMinor (SALE must be strict)", () => {
    const r = adminPriceRowSchema.safeParse({
      currency: "USD",
      priceMinor: 1000,
      originalPriceMinor: 1000,
    });

    expect(r.success).toBe(false);
  });

  it("accepts originalPriceMinor > priceMinor", () => {
    const r = adminPriceRowSchema.safeParse({
      currency: "USD",
      priceMinor: 1000,
      originalPriceMinor: 1200,
    });

    expect(r.success).toBe(true);
  });
});

