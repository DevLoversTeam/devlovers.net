import { Link } from '@/i18n/routing'
import Image from "next/image"
import type { ShopCategory } from "@/lib/shop/data"

interface CategoryTileProps {
  category: ShopCategory
}

export function CategoryTile({ category }: CategoryTileProps) {
  return (
    <Link
      href={`/shop/products?category=${category.slug}`}
      className="group relative aspect-[4/3] overflow-hidden rounded-lg"
    >
      <Image
        src={category.image || "/placeholder.svg"}
        alt={category.name}
        fill
        className="object-cover transition-transform duration-500 group-hover:scale-105"
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
      <div className="absolute bottom-0 left-0 p-6">
        <h3 className="text-2xl font-bold text-white">{category.name}</h3>
        <span className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-white/90 opacity-0 transition-opacity group-hover:opacity-100">
          Shop now <span aria-hidden="true">→</span>
        </span>
      </div>
    </Link>
  )
}
