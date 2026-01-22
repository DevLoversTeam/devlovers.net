// frontend/lib/errors/products.ts

export class ProductNotFoundError extends Error {
  readonly code = 'PRODUCT_NOT_FOUND' as const;

  constructor(productId: string) {
    super(`Product not found: ${productId}`);
    this.name = 'ProductNotFoundError';
  }
}
