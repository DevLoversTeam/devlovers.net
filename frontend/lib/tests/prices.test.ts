import { describe, expect, it } from "vitest";
import { adminPriceRowSchema } from "../validation/shop";

describe("pricing validation", () => {
  it("rejects originalPrice == price (SALE must be strict)", () => {
    const r = adminPriceRowSchema.safeParse({
      currency: "USD",
      price: "10.00",
      originalPrice: "10.00",
    });
    expect(r.success).toBe(false);
  });

  it("accepts originalPrice > price", () => {
    const r = adminPriceRowSchema.safeParse({
      currency: "USD",
      price: "10.00",
      originalPrice: "12.00",
    });
    expect(r.success).toBe(true);
  });
});
