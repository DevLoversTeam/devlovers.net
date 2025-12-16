import { z } from "zod"

import { productAdminSchema, productAdminUpdateSchema } from "@/lib/validation/shop"

type ParsedResult<T> = { ok: true; data: T } | { ok: false; error: z.ZodError<any> }

type ParseMode = "create" | "update"

const getStringField = (formData: FormData, name: string): string | undefined => {
  const value = formData.get(name)
  if (typeof value !== "string") {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed === "" ? undefined : trimmed
}

const parseBooleanField = (formData: FormData, name: string): boolean | undefined => {
  const value = formData.get(name)
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    if (normalized === "true") return true
    if (normalized === "false") return false
  }
  if (typeof value === "boolean") return value
  return undefined
}

const parseNumberField = (formData: FormData, name: string): number | undefined => {
  const value = getStringField(formData, name)
  if (value === undefined) return undefined
  const parsed = Number(value)
  return parsed
}

const parseArrayField = (
  formData: FormData,
  name: string,
  mode: ParseMode,
): string[] | undefined => {
  const hasField = formData.has(name)
  const rawValue = getStringField(formData, name)

  if (mode === "update" && !hasField && rawValue === undefined) {
    return undefined
  }

  const value = rawValue ?? ""
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

export function parseAdminProductForm(
  formData: FormData,
  options?: { mode?: "create" },
): ParsedResult<z.infer<typeof productAdminSchema>>
export function parseAdminProductForm(
  formData: FormData,
  options: { mode: "update" },
): ParsedResult<z.infer<typeof productAdminUpdateSchema>>
export function parseAdminProductForm(
  formData: FormData,
  options: { mode?: ParseMode } = {},
): ParsedResult<z.infer<typeof productAdminSchema> | z.infer<typeof productAdminUpdateSchema>> {
  const mode: ParseMode = options.mode ?? "create"

  const payload = {
    title: getStringField(formData, "title"),
    slug: getStringField(formData, "slug"),
    price: parseNumberField(formData, "price"),
    originalPrice: parseNumberField(formData, "originalPrice"),
    currency: getStringField(formData, "currency"),
    description: getStringField(formData, "description"),
    category: getStringField(formData, "category"),
    type: getStringField(formData, "type"),
    colors: parseArrayField(formData, "colors", mode),
    sizes: parseArrayField(formData, "sizes", mode),
    stock: parseNumberField(formData, "stock"),
    sku: getStringField(formData, "sku"),
    badge: getStringField(formData, "badge"),
    isActive: parseBooleanField(formData, "isActive"),
    isFeatured: parseBooleanField(formData, "isFeatured"),
  }

  const parsed = mode === "update" ? productAdminUpdateSchema.safeParse(payload) : productAdminSchema.safeParse(payload)

  if (!parsed.success) {
    return { ok: false, error: parsed.error }
  }

  return { ok: true, data: parsed.data }
}

export type AdminProductCreatePayload = z.infer<typeof productAdminSchema>
export type AdminProductUpdatePayload = z.infer<typeof productAdminUpdateSchema>
export type ParseAdminProductResult<T> = ParsedResult<T>
