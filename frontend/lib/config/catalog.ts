export const CATEGORIES = [
  { slug: "all", label: "All Products" },
  { slug: "new-arrivals", label: "New Arrivals" },
  { slug: "best-sellers", label: "Best Sellers" },
  { slug: "apparel", label: "Apparel" },
  { slug: "lifestyle", label: "Lifestyle" },
  { slug: "collectibles", label: "Collectibles" },
  { slug: "sale", label: "Sale" },
] as const

export const PRODUCT_TYPES = [
  { slug: "accessories", label: "Accessories" },
  { slug: "shirts", label: "Shirts" },
  { slug: "drinkware", label: "Drinkware" },
  { slug: "technology", label: "Technology" },
] as const

export const COLORS = [
  { slug: "black", label: "Black", hex: "#000000" },
  { slug: "white", label: "White", hex: "#ffffff" },
  { slug: "grey", label: "Grey", hex: "#6b7280" },
  { slug: "navy", label: "Navy", hex: "#1e3a5f" },
  {
    slug: "multicolor",
    label: "Multicolor",
    hex: "linear-gradient(135deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #8b00ff)",
  },
] as const

export const SIZES = ["XS", "S", "M", "L", "XL", "XXL"] as const

export const SORT_OPTIONS = [
  { value: "featured", label: "Featured" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "newest", label: "Newest" },
] as const

export const CATALOG_PAGE_SIZE = 12

export const CATEGORY_TILES = [
  { id: "apparel", name: "Apparel", slug: "apparel", image: "/apparel.jpg" },
  { id: "collectibles", name: "Collectibles", slug: "collectibles", image: "/collectibles.jpg" },
  { id: "lifestyle", name: "Lifestyle", slug: "lifestyle", image: "/lifestyle.jpg" },
] as const


export type CatalogSort = (typeof SORT_OPTIONS)[number]["value"]
