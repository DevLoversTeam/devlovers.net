import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { db } from "@/db";
import { products, productPrices } from "@/db/schema";
import { getPublicProductBySlug } from "@/db/queries/shop/products";

async function cleanup(productId: string) {
  await db.delete(productPrices).where(eq(productPrices.productId, productId));
  await db.delete(products).where(eq(products.id, productId));
}

describe("P0-5 Public products: inactive not visible", () => {
  it("inactive slug -> 404 (selector returns null)", async () => {
    const productId = randomUUID();
    const slug = `inactive-${randomUUID()}`;

    try {
      await db.insert(products).values({
        id: productId,
        slug,
        title: "Inactive product",
        description: null,
        imageUrl: "https://placehold.co/600x600",
        imagePublicId: null,
        category: null,
        type: null,
        colors: [],
        sizes: [],
        badge: "NONE",
        isActive: false,
        isFeatured: false,
        stock: 5,
        sku: null,

        // legacy mirror required by schema + checks
       price: "10.00",
        originalPrice: null,
        currency: "USD",
      });

      await db.insert(productPrices).values({
        id: randomUUID(),
        productId,
        currency: "USD",

        // canonical + mirror must match checks
        priceMinor: 1000,
        originalPriceMinor: null,
        price: "10.00",
        originalPrice: null,
      });

      const result = await getPublicProductBySlug(slug, "USD");
      expect(result).toBeNull();
    } finally {
      await cleanup(productId);
    }
  });

  it("active slug -> 200 (selector returns product)", async () => {
    const productId = randomUUID();
    const slug = `active-${randomUUID()}`;

    try {
      await db.insert(products).values({
        id: productId,
        slug,
        title: "Active product",
        description: null,
        imageUrl: "https://placehold.co/600x600",
        imagePublicId: null,
        category: null,
        type: null,
        colors: [],
        sizes: [],
        badge: "NONE",
        isActive: true,
        isFeatured: false,
        stock: 5,
        sku: null,

        // legacy mirror required by schema + checks
       price: "19.99",
        originalPrice: null,
        currency: "USD",
      });

      await db.insert(productPrices).values({
        id: randomUUID(),
        productId,
        currency: "USD",

        // canonical + mirror must match checks
        priceMinor: 1999,
        originalPriceMinor: null,
        price: "19.99",
        originalPrice: null,
      });

      const result = await getPublicProductBySlug(slug, "USD");
      expect(result).not.toBeNull();
      expect(result!.slug).toBe(slug);
      expect(result!.currency).toBe("USD");
    } finally {
      await cleanup(productId);
    }
  });
});
