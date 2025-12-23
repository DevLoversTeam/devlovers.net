// app/products/[slug]/page.tsx

import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { AddToCartButton } from "@/components/shop/add-to-cart-button"
import { getCatalogProducts, getProductDetail } from "@/lib/shop/data"
import { formatPrice } from "@/lib/shop/currency"

export async function generateStaticParams() {
  const { products } = await getCatalogProducts({ category: "all", page: 1, limit: 100 })
  return products.map((product) => ({ slug: product.slug }))
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  const product = await getProductDetail(slug)

  if (!product) {
    notFound()
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/shop/products"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to all products
      </Link>

      <div className="mt-8 grid gap-8 lg:grid-cols-2 lg:gap-16">
        <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
          {product.badge && product.badge !== "NONE" && (
            <span
              className={`absolute left-4 top-4 z-10 rounded px-2 py-1 text-xs font-semibold uppercase ${
                product.badge === "SALE"
                  ? "bg-accent text-accent-foreground"
                  : "bg-foreground text-background"
              }`}
            >
              {product.badge}
            </span>
          )}
          <Image
            src={product.image || "/placeholder.svg"}
            alt={product.name}
            fill
            className="object-cover"
            sizes="(max-width: 1024px) 100vw, 50vw"
            priority
          />
        </div>

        <div className="flex flex-col">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{product.name}</h1>

          <div className="mt-4 flex items-center gap-3">
            <span className={`text-2xl font-bold ${product.badge === "SALE" ? "text-accent" : "text-foreground"}`}>
              {formatPrice(product.price)}
            </span>
            {product.originalPrice && (
              <span className="text-lg text-muted-foreground line-through">
                {formatPrice(product.originalPrice)}
              </span>
            )}
          </div>

          {product.description && <p className="mt-6 text-muted-foreground">{product.description}</p>}

          <AddToCartButton product={product} />
        </div>
      </div>
    </div>
  )
}
