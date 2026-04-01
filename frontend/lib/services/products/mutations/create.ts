import { db } from '@/db';
import { productImages, productPrices, products } from '@/db/schema';
import {
  destroyProductImage,
  uploadProductImageFromFile,
} from '@/lib/cloudinary';
import { logError } from '@/lib/logging';
import { toDbMoney } from '@/lib/shop/money';
import type { DbProduct, ProductInput } from '@/lib/types/shop';

import { InvalidPayloadError, SlugConflictError } from '../../errors';
import { mapRowToProduct } from '../mapping';
import { resolvePhotoPlan } from '../photo-plan';
import {
  assertMergedPricesPolicy,
  enforceSaleBadgeRequiresOriginal,
  normalizePricesFromInput,
  resolveLegacyCompatPriceMirror,
  validatePriceRows,
} from '../prices';
import { normalizeSlug } from '../slug';

export async function createProduct(input: ProductInput): Promise<DbProduct> {
  const slug = await normalizeSlug(
    db,
    (input as any).slug ?? (input as any).title
  );

  const prices = normalizePricesFromInput(input);
  if (!prices.length) {
    throw new InvalidPayloadError('Product pricing is required.');
  }

  validatePriceRows(prices);
  assertMergedPricesPolicy(prices, {
    requiredCurrency: 'UAH',
    requireUsd: false,
  });

  const badge = (input as any).badge ?? 'NONE';
  enforceSaleBadgeRequiresOriginal(badge, prices);

  const legacyMirror = resolveLegacyCompatPriceMirror(prices);

  const legacyImage =
    (input as any).image instanceof File && (input as any).image.size > 0
      ? ((input as any).image as File)
      : null;

  const requestedUploads =
    Array.isArray((input as any).images) && (input as any).images.length > 0
      ? ((input as any).images as Array<{ uploadId: string; file: File }>)
      : legacyImage
        ? [{ uploadId: 'legacy-image', file: legacyImage }]
        : [];

  const requestedPhotoPlan =
    Array.isArray((input as any).imagePlan) &&
    (input as any).imagePlan.length > 0
      ? (input as any).imagePlan
      : legacyImage
        ? [{ uploadId: 'legacy-image', isPrimary: true }]
        : [];

  if (!requestedPhotoPlan.length) {
    const error = new InvalidPayloadError(
      'At least one product photo is required.',
      {
        code: 'IMAGE_REQUIRED',
      }
    );
    (error as any).field = 'photos';
    throw error;
  }

  const resolvedPhotoPlan = resolvePhotoPlan({
    mode: 'create',
    photoPlan: requestedPhotoPlan,
    uploads: requestedUploads,
  });

  const uploadedById = new Map<
    string,
    { secureUrl: string; publicId: string }
  >();

  try {
    for (const upload of requestedUploads) {
      if (!upload.file.type?.startsWith('image/')) {
        const error = new InvalidPayloadError(
          'Uploaded file must be an image.',
          {
            code: 'INVALID_PRODUCT_PHOTOS',
          }
        );
        (error as any).field = 'photos';
        throw error;
      }

      const uploaded = await uploadProductImageFromFile(upload.file);
      uploadedById.set(upload.uploadId, uploaded);
    }
  } catch (error) {
    for (const uploaded of uploadedById.values()) {
      try {
        await destroyProductImage(uploaded.publicId);
      } catch (cleanupError) {
        logError(
          'Failed to cleanup uploaded image after create upload failure',
          cleanupError
        );
      }
    }
    logError('Failed to upload product image', error);
    throw error;
  }

  try {
    const primaryPhoto = resolvedPhotoPlan.find(item => item.isPrimary);
    if (!primaryPhoto || primaryPhoto.source !== 'new') {
      const error = new InvalidPayloadError(
        'A primary product photo is required.',
        {
          code: 'INVALID_PRODUCT_PHOTOS',
        }
      );
      (error as any).field = 'photos';
      throw error;
    }

    const primaryUpload = uploadedById.get(primaryPhoto.uploadId);
    if (!primaryUpload) {
      const error = new InvalidPayloadError(
        'Primary product photo upload is missing.',
        { code: 'INVALID_PRODUCT_PHOTOS' }
      );
      (error as any).field = 'photos';
      throw error;
    }

    const row = await db.transaction(async tx => {
      const [inserted] = await tx
        .insert(products)
        .values({
          slug,
          title: (input as any).title,
          description: (input as any).description ?? null,
          imageUrl: primaryUpload.secureUrl,
          imagePublicId: primaryUpload.publicId,
          // Legacy products.* price fields remain schema-constrained to USD.
          // When no dormant USD row is supplied, mirror the canonical admin row
          // for compatibility only while product_prices stays authoritative.
          price: toDbMoney(legacyMirror.priceMinor),
          originalPrice:
            legacyMirror.originalPriceMinor == null
              ? null
              : toDbMoney(legacyMirror.originalPriceMinor),
          currency: 'USD',

          category: (input as any).category ?? null,
          type: (input as any).type ?? null,
          colors: (input as any).colors ?? [],
          sizes: (input as any).sizes ?? [],
          badge: (input as any).badge ?? 'NONE',
          isActive: (input as any).isActive ?? true,
          isFeatured: (input as any).isFeatured ?? false,
          stock: (input as any).stock ?? 0,
          sku: (input as any).sku ?? null,
        })
        .onConflictDoNothing({ target: products.slug })
        .returning();

      if (!inserted) {
        throw new SlugConflictError('Slug already exists.');
      }

      await tx.insert(productPrices).values(
        prices.map(p => {
          const priceMinor = p.priceMinor;
          const originalMinor = p.originalPriceMinor;

          return {
            productId: inserted.id,
            currency: p.currency,
            priceMinor,
            originalPriceMinor: originalMinor,
            price: toDbMoney(priceMinor),
            originalPrice:
              originalMinor == null ? null : toDbMoney(originalMinor),
          };
        })
      );

      await tx.insert(productImages).values(
        resolvedPhotoPlan.map(item => {
          if (item.source !== 'new') {
            throw new InvalidPayloadError(
              'Create product photo plan cannot reference existing images.',
              { code: 'INVALID_PRODUCT_PHOTOS' }
            );
          }

          const uploaded = uploadedById.get(item.uploadId);
          if (!uploaded) {
            throw new InvalidPayloadError(
              'Uploaded product photo is missing.',
              {
                code: 'INVALID_PRODUCT_PHOTOS',
              }
            );
          }

          return {
            productId: inserted.id,
            imageUrl: uploaded.secureUrl,
            imagePublicId: uploaded.publicId,
            sortOrder: item.sortOrder,
            isPrimary: item.isPrimary,
          };
        })
      );

      return inserted;
    });

    return await mapRowToProduct(row);
  } catch (error) {
    for (const uploaded of uploadedById.values()) {
      try {
        await destroyProductImage(uploaded.publicId);
      } catch (cleanupError) {
        logError(
          'Failed to cleanup uploaded image after create failure',
          cleanupError
        );
      }
    }

    throw error;
  }
}
