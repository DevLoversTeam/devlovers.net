// export class InvalidPayloadError extends Error {
//   code = "INVALID_PAYLOAD" as const
// }

export class InsufficientStockError extends Error {
  code = "INSUFFICIENT_STOCK" as const
}

export class OrderNotFoundError extends Error {
  code = "ORDER_NOT_FOUND" as const
}

// export class SlugConflictError extends Error {
//   code = "SLUG_CONFLICT" as const
// }
export class InvalidPayloadError extends Error {
   code = 'INVALID_PAYLOAD' as const;
   constructor(message = 'Invalid payload') {
     super(message);
     this.name = 'InvalidPayloadError';
   }
 }
 
export class PriceConfigError extends Error {
  code = 'PRICE_CONFIG_ERROR' as const;
  productId?: string;
  currency?: string;
  constructor(message = 'Price not configured for currency.', options?: { productId?: string; currency?: string }) {
    super(message);
    this.name = 'PriceConfigError';
    this.productId = options?.productId;
    this.currency = options?.currency;
  }
}
export class SlugConflictError extends Error {
   code = 'SLUG_CONFLICT' as const;
   constructor(message = 'Slug already exists') {
     super(message);
     this.name = 'SlugConflictError';
   }
 }