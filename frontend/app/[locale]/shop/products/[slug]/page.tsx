// app/[locale]/shop/products/[slug]/page.tsx

import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { AddToCartButton } from "@/components/shop/add-to-cart-button";
import { getProductPageData } from "@/lib/shop/data";
import { formatMoney } from "@/lib/shop/currency";

import { Link } from "@/i18n/routing";

export const dynamic = "force-dynamic";

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}) {
  const { slug, locale } = await params;

  const result = await getProductPageData(slug, locale);

  if (result.kind === "not_found") {
    notFound();
  }

  if (result.kind === "unavailable") {
    const p = result.product;

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
            {p.badge && p.badge !== "NONE" && (
              <span className="absolute left-4 top-4 z-10 rounded px-2 py-1 text-xs font-semibold uppercase bg-foreground text-background">
                {p.badge}
              </span>
            )}
            <Image
              src={p.image || "/placeholder.svg"}
              alt={p.name}
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 50vw"
              priority
            />
          </div>

          <div className="flex flex-col">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              {p.name}
            </h1>

            <div className="mt-4 rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              This product is not available in your locale/currency.
            </div>

            {p.description && (
              <p className="mt-6 text-muted-foreground">{p.description}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const product = result.product;

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
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {product.name}
          </h1>

          <div className="mt-4 flex items-center gap-3">
            <span
              className={`text-2xl font-bold ${
                product.badge === "SALE" ? "text-accent" : "text-foreground"
              }`}
            >
              {formatMoney(product.price, product.currency, locale)}
            </span>

            {product.originalPrice && (
              <span className="text-lg text-muted-foreground line-through">
                {formatMoney(product.originalPrice, product.currency, locale)}
              </span>
            )}
          </div>

          {product.description && (
            <p className="mt-6 text-muted-foreground">{product.description}</p>
          )}

          <AddToCartButton product={product} />
        </div>
      </div>
    </div>
  );
}
