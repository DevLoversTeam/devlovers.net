import { notFound } from "next/navigation"
import { eq } from "drizzle-orm"
import { z } from "zod"

import { ProductForm } from "../../_components/product-form"
import { db } from "@/db"
import { products, productPrices } from "@/db/schema"
import type { CurrencyCode } from "@/lib/shop/currency"
import { currencyValues } from "@/lib/shop/currency"


const paramsSchema = z.object({ id: z.string().uuid() })

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const rawParams = await params
  const parsed = paramsSchema.safeParse(rawParams)
  if (!parsed.success) return notFound()

  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, parsed.data.id))
    .limit(1)

  if (!product) return notFound()

  const prices = await db
    .select({
      currency: productPrices.currency,
      price: productPrices.price,
      originalPrice: productPrices.originalPrice,
    })
    .from(productPrices)
    .where(eq(productPrices.productId, product.id))

  const initialPrices =
  prices.length
    ? prices
        .filter((p): p is typeof p & { currency: CurrencyCode } =>
          currencyValues.includes(p.currency as CurrencyCode)
        )
        .map((p) => ({
          currency: p.currency as CurrencyCode,
          price: String(p.price),
          originalPrice: p.originalPrice == null ? null : String(p.originalPrice),
        }))
    : [
        {
          currency: "USD" as const,
          price: String(product.price),
          originalPrice: product.originalPrice == null ? null : String(product.originalPrice),
        },
      ]


  return (
    <ProductForm
      mode="edit"
      productId={product.id}
      initialValues={{
        title: product.title,
        slug: product.slug,
        prices: initialPrices,
        description: product.description ?? undefined,
        category: product.category ?? undefined,
        type: product.type ?? undefined,
        colors: product.colors ?? [],
        sizes: product.sizes ?? [],
        badge: product.badge ?? undefined,
        isActive: product.isActive,
        isFeatured: product.isFeatured,
        stock: product.stock,
        sku: product.sku ?? undefined,
        imageUrl: product.imageUrl,
      }}
    />
  )
}
