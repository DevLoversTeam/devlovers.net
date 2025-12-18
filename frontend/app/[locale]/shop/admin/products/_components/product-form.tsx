"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { CATEGORIES, COLORS, PRODUCT_TYPES, SIZES } from "@/lib/config/catalog";

import type { ProductAdminInput } from "@/lib/validation/shop";

const localSlugify = (input: string): string => {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
};

type ProductFormProps = {
  mode: "create" | "edit";
  productId?: string;
  initialValues?: Partial<ProductAdminInput> & { imageUrl?: string };
};

type ApiResponse = {
  success?: boolean;
  product?: { id: string; slug: string };
  error?: string;
  code?: string;
  field?: string;
};

export function ProductForm({
  mode,
  productId,
  initialValues,
}: ProductFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initialValues?.title ?? "");
  const [slug, setSlug] = useState(
    initialValues?.slug
      ? localSlugify(initialValues.slug)
      : localSlugify(initialValues?.title ?? "")
  );
  const [price, setPrice] = useState(
    initialValues?.price ? String(initialValues.price) : ""
  );
  const [originalPrice, setOriginalPrice] = useState(
    initialValues?.originalPrice ? String(initialValues.originalPrice) : ""
  );
  const [currency, setCurrency] = useState<string>(
    initialValues?.currency ?? "USD"
  );
  const [category, setCategory] = useState(initialValues?.category ?? "");
  const [type, setType] = useState(initialValues?.type ?? "");
  const [selectedColors, setSelectedColors] = useState<string[]>(
    initialValues?.colors ?? []
  );
  const [selectedSizes, setSelectedSizes] = useState<string[]>(
    initialValues?.sizes ?? []
  );
  const [stock, setStock] = useState(
    typeof initialValues?.stock === "number" ? String(initialValues.stock) : ""
  );
  const [sku, setSku] = useState(initialValues?.sku ?? "");
  const [badge, setBadge] = useState<ProductAdminInput["badge"]>(
    initialValues?.badge ?? "NONE"
  );
  const [description, setDescription] = useState(
    initialValues?.description ?? ""
  );
  const [isActive, setIsActive] = useState(initialValues?.isActive ?? true);
  const [isFeatured, setIsFeatured] = useState(
    initialValues?.isFeatured ?? false
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [existingImageUrl] = useState(initialValues?.imageUrl);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  useEffect(() => {
    setSlug(localSlugify(title));
  }, [title]);

  const slugValue = useMemo(() => slug || localSlugify(title), [slug, title]);

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setImageFile(file);
    setImageError(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSlugError(null);
    setImageError(null);

    if (mode === "create" && !imageFile) {
      setImageError("Image file is required.");
      return;
    }

    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("title", title);
      formData.append("slug", slugValue);
      formData.append("price", price);

      if (originalPrice) formData.append("originalPrice", originalPrice);
      if (currency) formData.append("currency", currency);
      if (category) formData.append("category", category);
      if (type) formData.append("type", type);
      formData.append("colors", selectedColors.join(","));
      formData.append("sizes", selectedSizes.join(","));
      if (stock) formData.append("stock", stock);
      if (sku) formData.append("sku", sku);
      if (badge) formData.append("badge", badge);
      if (description) formData.append("description", description);

      formData.append("isActive", isActive ? "true" : "false");
      formData.append("isFeatured", isFeatured ? "true" : "false");

      if (imageFile) {
        formData.append("image", imageFile);
      }

            const response = await fetch(
        mode === "create"
          ? "/api/shop/admin/products"
          : `/api/shop/admin/products/${productId}`,
        {
          method: mode === "create" ? "POST" : "PATCH",
          body: formData,
        }
      );


      const data: ApiResponse = await response.json();

      if (!response.ok) {
        if (data.code === "SLUG_CONFLICT" || data.field === "slug") {
          setSlugError("This slug is already used. Try changing the title.");
        }

        if (data.code === "IMAGE_UPLOAD_FAILED" || data.field === "image") {
          setImageError(data.error ?? "Failed to upload image");
        }

        setError(
          data.error ??
            `Failed to ${mode === "create" ? "create" : "update"} product`
        );
        return;
      }

      const destinationSlug = data.product?.slug ?? slugValue;
      router.push(`/shop/products/${destinationSlug}`);
    } catch (err) {
      console.error(
        `Failed to ${mode === "create" ? "create" : "update"} product`,
        err
      );
      setError(
        `Unexpected error while ${mode === "create" ? "creating" : "updating"} product.`
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold text-foreground">
        {mode === "create" ? "Create new product" : "Edit product"}
      </h1>

      {error ? (
        <div className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <form
        className="mt-6 space-y-4"
        onSubmit={handleSubmit}
        encType="multipart/form-data"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              className="block text-sm font-medium text-foreground"
              htmlFor="title"
            >
              Title
            </label>
            <input
              id="title"
              className="w-full rounded-md border border-border px-3 py-2 text-sm"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label
                className="block text-sm font-medium text-foreground"
                htmlFor="slug"
              >
                Slug
              </label>
              <span className="text-xs text-muted-foreground">
                Auto-generated from title
              </span>
            </div>
            <input
              id="slug"
              className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm"
              type="text"
              value={slugValue}
              readOnly
            />
            {slugError ? (
              <p className="mt-1 text-sm text-red-600">{slugError}</p>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              className="block text-sm font-medium text-foreground"
              htmlFor="price"
            >
              Price
            </label>
            <input
              id="price"
              className="w-full rounded-md border border-border px-3 py-2 text-sm"
              type="text"
              placeholder="59.00"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              required
            />
          </div>

          <div>
            <label
              className="block text-sm font-medium text-foreground"
              htmlFor="originalPrice"
            >
              Original price
            </label>
            <input
              id="originalPrice"
              className="w-full rounded-md border border-border px-3 py-2 text-sm"
              type="text"
              value={originalPrice}
              onChange={(event) => setOriginalPrice(event.target.value)}
              placeholder="79.00"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              className="block text-sm font-medium text-foreground"
              htmlFor="currency"
            >
              Currency
            </label>
            <input
              id="currency"
              className="w-full rounded-md border border-border px-3 py-2 text-sm"
              type="text"
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
            />
          </div>

          <div>
            <label
              className="block text-sm font-medium text-foreground"
              htmlFor="stock"
            >
              Stock
            </label>
            <input
              id="stock"
              className="w-full rounded-md border border-border px-3 py-2 text-sm"
              type="number"
              value={stock}
              onChange={(event) => setStock(event.target.value)}
              min={0}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              className="block text-sm font-medium text-foreground"
              htmlFor="category"
            >
              Category
            </label>
            <select
              id="category"
              className="w-full rounded-md border border-border bg-background text-foreground px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="">Select category</option>
              {CATEGORIES.filter(
                (categoryOption) => categoryOption.slug !== "all"
              ).map((categoryOption) => (
                <option key={categoryOption.slug} value={categoryOption.slug}>
                  {categoryOption.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              className="block text-sm font-medium text-foreground"
              htmlFor="type"
            >
              Type
            </label>
            <select
              id="type"
              className="w-full rounded-md border border-border bg-background text-foreground px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              value={type}
              onChange={(event) => setType(event.target.value)}
            >
              <option value="">Select type</option>
              {PRODUCT_TYPES.map((productType) => (
                <option key={productType.slug} value={productType.slug}>
                  {productType.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              className="block text-sm font-medium text-foreground"
              htmlFor="colors"
            >
              Colors
            </label>
            <div className="flex flex-col gap-2 rounded-md border border-border px-3 py-2">
              {COLORS.map((color) => (
                <label
                  key={color.slug}
                  className="flex items-center gap-2 text-sm text-foreground"
                >
                  <input
                    type="checkbox"
                    value={color.slug}
                    checked={selectedColors.includes(color.slug)}
                    onChange={(event) => {
                      if (event.target.checked) {
                        setSelectedColors((prev) => [...prev, color.slug]);
                      } else {
                        setSelectedColors((prev) =>
                          prev.filter(
                            (selectedColor) => selectedColor !== color.slug
                          )
                        );
                      }
                    }}
                  />
                  <span>{color.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label
              className="block text-sm font-medium text-foreground"
              htmlFor="sizes"
            >
              Sizes
            </label>
            <div className="flex flex-col gap-2 rounded-md border border-border px-3 py-2">
              {SIZES.map((size) => (
                <label
                  key={size}
                  className="flex items-center gap-2 text-sm text-foreground"
                >
                  <input
                    type="checkbox"
                    value={size}
                    checked={selectedSizes.includes(size)}
                    onChange={(event) => {
                      if (event.target.checked) {
                        setSelectedSizes((prev) => [...prev, size]);
                      } else {
                        setSelectedSizes((prev) =>
                          prev.filter((selectedSize) => selectedSize !== size)
                        );
                      }
                    }}
                  />
                  <span>{size}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              className="block text-sm font-medium text-foreground"
              htmlFor="sku"
            >
              SKU
            </label>
            <input
              id="sku"
              className="w-full rounded-md border border-border px-3 py-2 text-sm"
              type="text"
              value={sku}
              onChange={(event) => setSku(event.target.value)}
            />
          </div>

          <div>
            <label
              className="block text-sm font-medium text-foreground"
              htmlFor="badge"
            >
              Badge
            </label>
            <select
              id="badge"
              className="w-full rounded-md border border-border bg-background text-foreground px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              value={badge}
              onChange={(event) =>
                setBadge(event.target.value as ProductAdminInput["badge"])
              }
            >
              <option value="NONE">None</option>
              <option value="SALE">SALE</option>
              <option value="NEW">NEW</option>
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center space-x-2">
            <input
              id="isActive"
              type="checkbox"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
              className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
            />
            <label
              className="text-sm font-medium text-foreground"
              htmlFor="isActive"
            >
              Is Active
            </label>
          </div>

          <div className="flex items-center space-x-2">
            <input
              id="isFeatured"
              type="checkbox"
              checked={isFeatured}
              onChange={(event) => setIsFeatured(event.target.checked)}
              className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
            />
            <label
              className="text-sm font-medium text-foreground"
              htmlFor="isFeatured"
            >
              Is Featured
            </label>
          </div>
        </div>

        <div>
          <label
            className="block text-sm font-medium text-foreground"
            htmlFor="description"
          >
            Description
          </label>
          <textarea
            id="description"
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
            rows={4}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        <div>
          <label
            className="block text-sm font-medium text-foreground"
            htmlFor="image"
          >
            Image
          </label>
          <input
            id="image"
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            required={mode === "create"}
          />
          {existingImageUrl && !imageFile ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Current image will be kept unless you upload a new one.
            </p>
          ) : null}
          {imageError ? (
            <p className="mt-1 text-sm text-red-600">{imageError}</p>
          ) : null}
        </div>

        <button
          type="submit"
          className="mt-6 w-full rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-60"
          disabled={isSubmitting}
        >
          {isSubmitting
            ? mode === "create"
              ? "Creating..."
              : "Updating..."
            : mode === "create"
              ? "Create product"
              : "Save changes"}
        </button>
      </form>
    </div>
  );
}
