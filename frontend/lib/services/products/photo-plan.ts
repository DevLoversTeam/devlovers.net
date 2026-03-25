import type { ProductImage, ProductImageUploadInput } from '@/lib/types/shop';
import type { AdminProductPhotoPlan } from '@/lib/validation/shop';

import { InvalidPayloadError } from '../errors';

type ResolvePhotoPlanOptions = {
  mode: 'create' | 'update';
  photoPlan: AdminProductPhotoPlan;
  existingImages?: ProductImage[];
  uploads?: ProductImageUploadInput[];
};

export type ResolvedPhotoPlanItem =
  | {
      source: 'existing';
      imageId: string;
      existingImage: ProductImage;
      isPrimary: boolean;
      sortOrder: number;
    }
  | {
      source: 'new';
      uploadId: string;
      upload: ProductImageUploadInput;
      isPrimary: boolean;
      sortOrder: number;
    };

function photoPayloadError(
  message: string,
  details?: Record<string, unknown>
): InvalidPayloadError {
  const error = new InvalidPayloadError(message, {
    code: 'INVALID_PRODUCT_PHOTOS',
    details,
  });
  (error as any).field = 'photos';
  return error;
}

function assertUniqueUploadIds(
  uploads: ProductImageUploadInput[],
  mode: ResolvePhotoPlanOptions['mode']
) {
  const seen = new Set<string>();

  for (const upload of uploads) {
    if (seen.has(upload.uploadId)) {
      throw photoPayloadError(
        'Uploaded photo payload contains duplicate upload ids.',
        {
          uploadId: upload.uploadId,
          mode,
        }
      );
    }

    seen.add(upload.uploadId);
  }
}

export function resolvePhotoPlan({
  mode,
  photoPlan,
  existingImages = [],
  uploads = [],
}: ResolvePhotoPlanOptions): ResolvedPhotoPlanItem[] {
  if (!photoPlan.length) {
    throw photoPayloadError('At least one product photo is required.');
  }

  assertUniqueUploadIds(uploads, mode);

  const existingById = new Map(existingImages.map(image => [image.id, image]));
  const uploadsById = new Map(uploads.map(upload => [upload.uploadId, upload]));

  const resolved = photoPlan.map((item, index) => {
    if (item.imageId) {
      const existingImage = existingById.get(item.imageId);
      if (!existingImage) {
        throw photoPayloadError(
          'Photo plan references an unknown existing image.',
          {
            imageId: item.imageId,
            mode,
          }
        );
      }

      return {
        source: 'existing' as const,
        imageId: item.imageId,
        existingImage,
        isPrimary: item.isPrimary,
        sortOrder: index,
      };
    }

    if (!item.uploadId) {
      throw photoPayloadError(
        'Photo plan item is missing an upload reference.'
      );
    }

    const upload = uploadsById.get(item.uploadId);
    if (!upload) {
      throw photoPayloadError(
        'Photo plan references an unknown uploaded photo.',
        {
          uploadId: item.uploadId,
          mode,
        }
      );
    }

    return {
      source: 'new' as const,
      uploadId: item.uploadId,
      upload,
      isPrimary: item.isPrimary,
      sortOrder: index,
    };
  });

  const usedUploadIds = new Set(
    resolved
      .filter(
        (item): item is Extract<ResolvedPhotoPlanItem, { source: 'new' }> =>
          item.source === 'new'
      )
      .map(item => item.uploadId)
  );

  for (const upload of uploads) {
    if (!usedUploadIds.has(upload.uploadId)) {
      throw photoPayloadError(
        'Uploaded photo is not referenced in the photo plan.',
        {
          uploadId: upload.uploadId,
          mode,
        }
      );
    }
  }

  if (mode === 'create' && resolved.some(item => item.source === 'existing')) {
    throw photoPayloadError(
      'Create photo plan cannot reference existing product images.'
    );
  }

  return resolved;
}
