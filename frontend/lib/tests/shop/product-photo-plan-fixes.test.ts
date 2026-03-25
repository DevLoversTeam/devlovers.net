// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
  getPhotoPlanSubmissionError,
  LEGACY_PHOTO_MIGRATION_REQUIRED_MESSAGE,
  ProductForm,
  revokeSupersededPhotoPreviewUrls,
} from '@/app/[locale]/admin/shop/products/_components/ProductForm';
import { InvalidPayloadError } from '@/lib/services/errors';
import { resolvePhotoPlan } from '@/lib/services/products/photo-plan';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

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

  it('blocks mixed legacy and non-legacy photo state before building a partial photo plan', () => {
    const mixedPhotos = [
      ...ensureUiPhotos({
        imageUrl: 'https://example.com/legacy-only.png',
      }),
      {
        key: 'new:upload-1',
        source: 'new' as const,
        uploadId: 'upload-1',
        previewUrl: 'blob:new-upload-1',
        isPrimary: false,
        file: new File(['new'], 'new.png', { type: 'image/png' }),
      },
    ];

    expect(getPhotoPlanSubmissionError(mixedPhotos)).toBe(
      LEGACY_PHOTO_MIGRATION_REQUIRED_MESSAGE
    );
    expect(() => buildPhotoPlanSubmission(mixedPhotos)).toThrowError(
      LEGACY_PHOTO_MIGRATION_REQUIRED_MESSAGE
    );
  });

  it('real submit flow blocks mixed legacy and new photo state before sending partial photoPlan', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:new-upload-1');

    render(
      createElement(ProductForm, {
        mode: 'edit',
        productId: 'product-1',
        csrfToken: 'csrf-token',
        initialValues: {
          title: 'Legacy product',
          slug: 'legacy-product',
          prices: [
            {
              currency: 'USD',
              priceMinor: 5900,
              originalPriceMinor: null,
            },
          ],
          imageUrl: 'https://example.com/legacy-only.png',
          colors: [],
          sizes: [],
          badge: 'NONE',
          isActive: true,
          isFeatured: false,
          stock: 3,
        },
      })
    );

    const fileInput = screen.getByLabelText('Photos');
    await user.upload(
      fileInput,
      new File(['new'], 'new.png', { type: 'image/png' })
    );

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      await screen.findByText(LEGACY_PHOTO_MIGRATION_REQUIRED_MESSAGE)
    ).toBeInTheDocument();
  });

  it('revokes superseded blob preview urls and keeps active previews intact', () => {
    const revokeSpy = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => undefined);

    revokeSupersededPhotoPreviewUrls(
      [
        {
          key: 'new:old',
          source: 'new',
          uploadId: 'old-upload',
          previewUrl: 'blob:old-preview',
          isPrimary: true,
          file: new File(['old'], 'old.png', { type: 'image/png' }),
        },
        {
          key: 'new:keep',
          source: 'new',
          uploadId: 'keep-upload',
          previewUrl: 'blob:keep-preview',
          isPrimary: false,
          file: new File(['keep'], 'keep.png', { type: 'image/png' }),
        },
      ],
      [
        {
          key: 'new:keep',
          source: 'new',
          uploadId: 'keep-upload',
          previewUrl: 'blob:keep-preview',
          isPrimary: true,
          file: new File(['keep'], 'keep.png', { type: 'image/png' }),
        },
      ]
    );

    expect(revokeSpy).toHaveBeenCalledTimes(1);
    expect(revokeSpy).toHaveBeenCalledWith('blob:old-preview');

    revokeSpy.mockRestore();
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
