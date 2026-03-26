import { asc, eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import { productImages } from '@/db/schema';
import { type ProductImage, productImageSchema } from '@/lib/validation/shop';

type ProductImagesReader = Pick<typeof db, 'select'>;

type ProductImageCompatibleRow = {
  id: string;
  imageUrl: string;
  imagePublicId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ResolvedProductImages = {
  images: ProductImage[];
  primaryImage?: ProductImage;
  imageUrl: string;
  imagePublicId?: string;
};

function buildLegacyProductImage(
  row: ProductImageCompatibleRow
): ProductImage | null {
  const imageUrl = row.imageUrl.trim();
  if (!imageUrl) return null;

  return productImageSchema.parse({
    id: `legacy:${row.id}`,
    productId: row.id,
    imageUrl,
    imagePublicId: row.imagePublicId ?? undefined,
    sortOrder: 0,
    isPrimary: true,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export async function getProductImagesByProductIds(
  productIds: string[],
  options?: { db?: ProductImagesReader }
): Promise<Map<string, ProductImage[]>> {
  const uniqueProductIds = Array.from(
    new Set(productIds.filter(id => typeof id === 'string' && id.trim().length))
  );

  const byProductId = new Map<string, ProductImage[]>();
  if (uniqueProductIds.length === 0) return byProductId;

  const executor = options?.db ?? db;
  const rows = await executor
    .select({
      id: productImages.id,
      productId: productImages.productId,
      imageUrl: productImages.imageUrl,
      imagePublicId: productImages.imagePublicId,
      sortOrder: productImages.sortOrder,
      isPrimary: productImages.isPrimary,
      createdAt: productImages.createdAt,
      updatedAt: productImages.updatedAt,
    })
    .from(productImages)
    .where(inArray(productImages.productId, uniqueProductIds))
    .orderBy(
      asc(productImages.sortOrder),
      asc(productImages.createdAt),
      asc(productImages.id)
    );

  for (const row of rows) {
    const parsed = productImageSchema.parse(row);
    const group = byProductId.get(parsed.productId);
    if (group) group.push(parsed);
    else byProductId.set(parsed.productId, [parsed]);
  }

  return byProductId;
}

export async function getProductImagesByProductId(
  productId: string,
  options?: { db?: ProductImagesReader }
): Promise<ProductImage[]> {
  const byProductId = await getProductImagesByProductIds([productId], options);
  return byProductId.get(productId) ?? [];
}

export function resolveProductImages(
  row: ProductImageCompatibleRow,
  storedImages?: ProductImage[]
): ResolvedProductImages {
  if (storedImages && storedImages.length > 0) {
    const primaryImage = storedImages.find(image => image.isPrimary);

    return {
      images: storedImages,
      primaryImage,
      imageUrl: primaryImage?.imageUrl ?? row.imageUrl,
      imagePublicId:
        primaryImage?.imagePublicId ?? row.imagePublicId ?? undefined,
    };
  }

  const legacyImage = buildLegacyProductImage(row);
  return {
    images: legacyImage ? [legacyImage] : [],
    primaryImage: legacyImage ?? undefined,
    imageUrl: legacyImage?.imageUrl ?? row.imageUrl,
    imagePublicId: legacyImage?.imagePublicId ?? row.imagePublicId ?? undefined,
  };
}

export async function getPrimaryProductImageRow(
  productId: string,
  options?: { db?: ProductImagesReader }
): Promise<ProductImage | null> {
  const executor = options?.db ?? db;
  const rows = await executor
    .select({
      id: productImages.id,
      productId: productImages.productId,
      imageUrl: productImages.imageUrl,
      imagePublicId: productImages.imagePublicId,
      sortOrder: productImages.sortOrder,
      isPrimary: productImages.isPrimary,
      createdAt: productImages.createdAt,
      updatedAt: productImages.updatedAt,
    })
    .from(productImages)
    .where(eq(productImages.productId, productId))
    .orderBy(
      asc(productImages.sortOrder),
      asc(productImages.createdAt),
      asc(productImages.id)
    );

  for (const row of rows) {
    const parsed = productImageSchema.parse(row);
    if (parsed.isPrimary) return parsed;
  }

  return null;
}
