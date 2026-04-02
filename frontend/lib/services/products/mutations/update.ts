import { eq, sql } from 'drizzle-orm';

import { db } from '@/db';
import { productImages, productPrices, products } from '@/db/schema';
import {
  destroyProductImage,
  uploadProductImageFromFile,
} from '@/lib/cloudinary';
import { ProductNotFoundError } from '@/lib/errors/products';
import { logError } from '@/lib/logging';
import type { CurrencyCode } from '@/lib/shop/currency';
import { toDbMoney } from '@/lib/shop/money';
import type { DbProduct, ProductUpdateInput } from '@/lib/types/shop';

import { InvalidPayloadError, SlugConflictError } from '../../errors';
import { getProductImagesByProductId } from '../images';
import { mapRowToProduct } from '../mapping';
import { resolvePhotoPlan } from '../photo-plan';
import {
  assertMergedPricesPolicy,
  assertMoneyMinorInt,
  enforceSaleBadgeRequiresOriginal,
  normalizePricesFromInput,
  validatePriceRows,
} from '../prices';
import { normalizeSlug } from '../slug';
import type { NormalizedPriceRow, ProductsTable } from '../types';

export async function updateProduct(
  id: string,
  input: ProductUpdateInput
): Promise<DbProduct> {
  const [existing] = await db
    .select()
    .from(products)
    .where(eq(products.id, id))
    .limit(1);

  if (!existing) {
    throw new ProductNotFoundError(id);
  }

  const existingImages = await getProductImagesByProductId(id);
  const currentPrimaryImage =
    existingImages.find(image => image.isPrimary) ?? null;

  const legacyImage =
    (input as any).image instanceof File && (input as any).image.size > 0
      ? ((input as any).image as File)
      : null;

  const requestedUploads =
    Array.isArray((input as any).images) && (input as any).images.length > 0
      ? ((input as any).images as Array<{ uploadId: string; file: File }>)
      : [];

  const hasExplicitPhotoPlan =
    Array.isArray((input as any).imagePlan) &&
    (input as any).imagePlan.length > 0;

  const slug = await normalizeSlug(
    db,
    (input as any).slug ?? (input as any).title ?? existing.slug,
    { excludeId: id }
  );

  let uploaded: { secureUrl: string; publicId: string } | null = null;

  if (!hasExplicitPhotoPlan && legacyImage) {
    try {
      uploaded = await uploadProductImageFromFile(legacyImage);
    } catch (error) {
      logError('Failed to upload replacement image', error);
      throw error;
    }
  }

  const prices = normalizePricesFromInput(input);
  if (prices.length) validatePriceRows(prices);

  const finalBadge = (input as any).badge ?? existing.badge;

  let resolvedPhotoPlan: ReturnType<typeof resolvePhotoPlan> | undefined;
  const uploadedById = new Map<
    string,
    { secureUrl: string; publicId: string }
  >();

  if (hasExplicitPhotoPlan) {
    resolvedPhotoPlan = resolvePhotoPlan({
      mode: 'update',
      photoPlan: (input as any).imagePlan,
      existingImages,
      uploads: requestedUploads,
    });

    try {
      for (const requestedUpload of requestedUploads) {
        if (!requestedUpload.file.type?.startsWith('image/')) {
          const error = new InvalidPayloadError(
            'Uploaded file must be an image.',
            { code: 'INVALID_PRODUCT_PHOTOS' }
          );
          (error as any).field = 'photos';
          throw error;
        }

        const uploadedImage = await uploadProductImageFromFile(
          requestedUpload.file
        );
        uploadedById.set(requestedUpload.uploadId, uploadedImage);
      }
    } catch (error) {
      for (const uploadedImage of uploadedById.values()) {
        try {
          await destroyProductImage(uploadedImage.publicId);
        } catch (cleanupError) {
          logError(
            'Failed to cleanup uploaded image after update upload failure',
            cleanupError
          );
        }
      }
      logError('Failed to upload admin product photos', error);
      throw error;
    }
  }

  const explicitPrimary =
    resolvedPhotoPlan?.find(item => item.isPrimary) ?? null;
  const explicitPrimaryImageUrl =
    explicitPrimary?.source === 'existing'
      ? explicitPrimary.existingImage.imageUrl
      : explicitPrimary?.source === 'new'
        ? uploadedById.get(explicitPrimary.uploadId)?.secureUrl
        : undefined;
  const explicitPrimaryImagePublicId =
    explicitPrimary?.source === 'existing'
      ? explicitPrimary.existingImage.imagePublicId
      : explicitPrimary?.source === 'new'
        ? uploadedById.get(explicitPrimary.uploadId)?.publicId
        : undefined;

  const mirroredImageUrl =
    explicitPrimaryImageUrl ??
    currentPrimaryImage?.imageUrl ??
    existing.imageUrl;
  const mirroredImagePublicId =
    explicitPrimaryImagePublicId ??
    currentPrimaryImage?.imagePublicId ??
    existing.imagePublicId ??
    undefined;

  const updateData: Partial<ProductsTable['$inferInsert']> = {
    slug,
    title: (input as any).title ?? existing.title,
    description: (input as any).description ?? existing.description ?? null,
    imageUrl: uploaded ? uploaded.secureUrl : mirroredImageUrl,
    imagePublicId: uploaded
      ? uploaded.publicId
      : (mirroredImagePublicId ?? null),

    category: (input as any).category ?? existing.category,
    type: (input as any).type ?? existing.type,
    colors: (input as any).colors ?? existing.colors,
    sizes: (input as any).sizes ?? existing.sizes,
    badge: (input as any).badge ?? existing.badge,
    isActive: (input as any).isActive ?? existing.isActive,
    isFeatured: (input as any).isFeatured ?? existing.isFeatured,
    stock: (input as any).stock ?? existing.stock,
    sku:
      (input as any).sku !== undefined
        ? (input as any).sku
          ? (input as any).sku
          : null
        : existing.sku,
  };
  // Legacy products.price/original_price are intentionally not updated here.
  // product_prices is the single write-authority for catalog pricing.

  try {
    const row = await db.transaction(async tx => {
      const existingPriceRows = await tx
        .select({
          currency: productPrices.currency,
          priceMinor: productPrices.priceMinor,
          originalPriceMinor: productPrices.originalPriceMinor,
        })
        .from(productPrices)
        .where(eq(productPrices.productId, id))
        .for('update');

      const merged = new Map<CurrencyCode, NormalizedPriceRow>();

      for (const r of existingPriceRows) {
        merged.set(r.currency as CurrencyCode, {
          currency: r.currency as CurrencyCode,
          priceMinor: assertMoneyMinorInt(
            r.priceMinor,
            `${String(r.currency)} priceMinor`
          ),
          originalPriceMinor:
            r.originalPriceMinor == null
              ? null
              : assertMoneyMinorInt(
                  r.originalPriceMinor,
                  `${String(r.currency)} originalPriceMinor`
                ),
        });
      }

      for (const p of prices) {
        merged.set(p.currency, p);
      }

      const mergedRows = Array.from(merged.values());

      assertMergedPricesPolicy(mergedRows, {
        productId: id,
        requiredCurrency: 'UAH',
        requireUsd: false,
      });

      if (finalBadge === 'SALE') {
        enforceSaleBadgeRequiresOriginal('SALE', mergedRows);
      }

      if (prices.length) {
        const upsertRows = prices.map(p => {
          const priceMinor = p.priceMinor;
          const originalMinor = p.originalPriceMinor;

          return {
            productId: id,
            currency: p.currency,
            priceMinor,
            originalPriceMinor: originalMinor,
            price: toDbMoney(priceMinor),
            originalPrice:
              originalMinor == null ? null : toDbMoney(originalMinor),
          };
        });

        await tx
          .insert(productPrices)
          .values(upsertRows)
          .onConflictDoUpdate({
            target: [productPrices.productId, productPrices.currency],
            set: {
              priceMinor: sql`excluded.price_minor`,
              originalPriceMinor: sql`excluded.original_price_minor`,
              price: sql`excluded.price`,
              originalPrice: sql`excluded.original_price`,
              updatedAt: sql`now()`,
            },
          });
      }

      if (resolvedPhotoPlan) {
        const retainedExistingIds = new Set(
          resolvedPhotoPlan
            .filter(
              (
                item
              ): item is Extract<
                (typeof resolvedPhotoPlan)[number],
                { source: 'existing' }
              > => item.source === 'existing'
            )
            .map(item => item.imageId)
        );

        const removedImages = existingImages.filter(
          image => !retainedExistingIds.has(image.id)
        );

        if (removedImages.length) {
          await tx.delete(productImages).where(
            sql`${productImages.productId} = ${id} and ${productImages.id} in (${sql.join(
              removedImages.map(image => sql`${image.id}`),
              sql`, `
            )})`
          );
        }

        for (const item of resolvedPhotoPlan) {
          if (item.source === 'existing') {
            await tx
              .update(productImages)
              .set({
                sortOrder: item.sortOrder,
                isPrimary: item.isPrimary,
                updatedAt: new Date(),
              })
              .where(eq(productImages.id, item.imageId));
            continue;
          }

          const uploadedImage = uploadedById.get(item.uploadId);
          if (!uploadedImage) {
            const error = new InvalidPayloadError(
              'Uploaded product photo is missing.',
              { code: 'INVALID_PRODUCT_PHOTOS' }
            );
            (error as any).field = 'photos';
            throw error;
          }

          await tx.insert(productImages).values({
            productId: id,
            imageUrl: uploadedImage.secureUrl,
            imagePublicId: uploadedImage.publicId,
            sortOrder: item.sortOrder,
            isPrimary: item.isPrimary,
          });
        }
      } else if (uploaded) {
        if (currentPrimaryImage) {
          await tx
            .update(productImages)
            .set({
              imageUrl: uploaded.secureUrl,
              imagePublicId: uploaded.publicId,
              updatedAt: new Date(),
            })
            .where(eq(productImages.id, currentPrimaryImage.id));
        } else {
          const nextSortOrder =
            existingImages.reduce(
              (maxSortOrder, image) => Math.max(maxSortOrder, image.sortOrder),
              -1
            ) + 1;

          await tx.insert(productImages).values({
            productId: id,
            imageUrl: uploaded.secureUrl,
            imagePublicId: uploaded.publicId,
            sortOrder: nextSortOrder,
            isPrimary: true,
          });
        }
      }

      const [updatedRow] = await tx
        .update(products)
        .set(updateData)
        .where(eq(products.id, id))
        .returning();

      if (!updatedRow) {
        throw new ProductNotFoundError(id);
      }

      return updatedRow;
    });

    if (resolvedPhotoPlan) {
      const retainedExistingIds = new Set(
        resolvedPhotoPlan
          .filter(
            (
              item
            ): item is Extract<
              (typeof resolvedPhotoPlan)[number],
              { source: 'existing' }
            > => item.source === 'existing'
          )
          .map(item => item.imageId)
      );

      const removedImages = existingImages.filter(
        image => !retainedExistingIds.has(image.id)
      );

      for (const removedImage of removedImages) {
        if (!removedImage.imagePublicId) continue;
        try {
          await destroyProductImage(removedImage.imagePublicId);
        } catch (cleanupError) {
          logError('Failed to cleanup removed product image', cleanupError);
        }
      }
    }

    const replacedPrimaryPublicId =
      currentPrimaryImage?.imagePublicId ?? existing.imagePublicId ?? null;

    if (
      uploaded &&
      replacedPrimaryPublicId &&
      replacedPrimaryPublicId !== uploaded.publicId
    ) {
      try {
        await destroyProductImage(replacedPrimaryPublicId);
      } catch (cleanupError) {
        logError('Failed to cleanup old image after update', cleanupError);
      }
    }

    return await mapRowToProduct(row);
  } catch (error) {
    for (const uploadedImage of uploadedById.values()) {
      try {
        await destroyProductImage(uploadedImage.publicId);
      } catch (cleanupError) {
        logError(
          'Failed to cleanup uploaded image after update failure',
          cleanupError
        );
      }
    }

    if (uploaded?.publicId) {
      try {
        await destroyProductImage(uploaded.publicId);
      } catch (cleanupError) {
        logError(
          'Failed to cleanup uploaded image after update failure',
          cleanupError
        );
      }
    }

    if ((error as { code?: string }).code === '23505') {
      throw new SlugConflictError('Slug already exists.');
    }
    throw error;
  }
}
