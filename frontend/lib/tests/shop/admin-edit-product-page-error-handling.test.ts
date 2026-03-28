import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProductNotFoundError } from '@/lib/errors/products';

const mocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  getAdminProductByIdWithPrices: vi.fn(),
  issueCsrfToken: vi.fn(() => 'csrf-token'),
}));

vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
}));

vi.mock('@/lib/services/products', () => ({
  getAdminProductByIdWithPrices: mocks.getAdminProductByIdWithPrices,
}));

vi.mock('@/lib/security/csrf', () => ({
  issueCsrfToken: mocks.issueCsrfToken,
}));

vi.mock('@/app/[locale]/admin/shop/products/_components/ProductForm', () => ({
  ProductForm: () => null,
}));

vi.mock('@/i18n/routing', () => ({
  Link: () => null,
}));

describe('admin edit product page error handling', () => {
  const validId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps only ProductNotFoundError to notFound()', async () => {
    mocks.getAdminProductByIdWithPrices.mockRejectedValueOnce(
      new ProductNotFoundError(validId)
    );

    const { default: EditProductPage } =
      await import('@/app/[locale]/admin/shop/products/[id]/edit/page');

    await expect(
      EditProductPage({
        params: Promise.resolve({ id: validId }),
      })
    ).rejects.toThrow('NEXT_NOT_FOUND');

    expect(mocks.notFound).toHaveBeenCalledTimes(1);
  });

  it('rethrows infra/runtime errors instead of converting them to false 404s', async () => {
    mocks.getAdminProductByIdWithPrices.mockRejectedValueOnce(
      new Error('db-down')
    );

    const { default: EditProductPage } =
      await import('@/app/[locale]/admin/shop/products/[id]/edit/page');

    await expect(
      EditProductPage({
        params: Promise.resolve({ id: validId }),
      })
    ).rejects.toThrow('db-down');

    expect(mocks.notFound).not.toHaveBeenCalled();
  });
});
