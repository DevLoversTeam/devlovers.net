// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/image', () => ({
  default: () => null,
}));

vi.mock('@/i18n/routing', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import {
  buildPhotoPlanSubmission,
  ensureUiPhotos,
} from '@/app/[locale]/admin/shop/products/_components/ProductForm';
import { InvalidPayloadError } from '@/lib/services/errors';
import { resolvePhotoPlan } from '@/lib/services/products/photo-plan';

describe('product photo plan fixes', () => {
  it('does not serialize fake existing image ids for legacy imageUrl-only edit state', () => {
    const photos = ensureUiPhotos({
      imageUrl: 'https://example.com/legacy-only.png',
    });

    expect(photos).toEqual([
      expect.objectContaining({
        key: 'legacy-image',
        source: 'legacy',
        previewUrl: 'https://example.com/legacy-only.png',
        isPrimary: true,
      }),
    ]);

    const submission = buildPhotoPlanSubmission(photos);

    expect(submission.photoPlan).toBeUndefined();
    expect(submission.newPhotos).toEqual([]);
  });

  it('rejects duplicate upload ids instead of silently collapsing them into a map', () => {
    expect(() =>
      resolvePhotoPlan({
        mode: 'update',
        photoPlan: [{ uploadId: 'dup-upload', isPrimary: true }],
        uploads: [
          {
            uploadId: 'dup-upload',
            file: new File(['first'], 'first.png', { type: 'image/png' }),
          },
          {
            uploadId: 'dup-upload',
            file: new File(['second'], 'second.png', { type: 'image/png' }),
          },
        ],
      })
    ).toThrowError(InvalidPayloadError);

    try {
      resolvePhotoPlan({
        mode: 'update',
        photoPlan: [{ uploadId: 'dup-upload', isPrimary: true }],
        uploads: [
          {
            uploadId: 'dup-upload',
            file: new File(['first'], 'first.png', { type: 'image/png' }),
          },
          {
            uploadId: 'dup-upload',
            file: new File(['second'], 'second.png', { type: 'image/png' }),
          },
        ],
      });
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidPayloadError);
      if (!(error instanceof InvalidPayloadError)) {
        throw error;
      }

      expect(error.code).toBe('INVALID_PRODUCT_PHOTOS');
      expect(error.details).toEqual({
        uploadId: 'dup-upload',
        mode: 'update',
      });
    }
  });
});
