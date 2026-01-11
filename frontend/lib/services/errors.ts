// export class InvalidPayloadError extends Error {
//   code = "INVALID_PAYLOAD" as const
// }

export class IdempotencyConflictError extends Error {
  code = 'IDEMPOTENCY_CONFLICT' as const;
  details?: Record<string, unknown>;
  constructor(
    message = 'Idempotency key reuse with different payload.',
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'IdempotencyConflictError';
    this.details = details;
  }
}

export class InsufficientStockError extends Error {
  code = 'INSUFFICIENT_STOCK' as const;
  constructor(message = 'Insufficient stock.') {
    super(message);
    this.name = 'InsufficientStockError';
  }
}

export class OrderNotFoundError extends Error {
  code = 'ORDER_NOT_FOUND' as const;
  constructor(message = 'Order not found.') {
    super(message);
    this.name = 'OrderNotFoundError';
  }
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

export class InvalidVariantError extends Error {
  code = 'INVALID_VARIANT' as const;

  productId?: string;
  field?: 'selectedSize' | 'selectedColor';
  value?: string;
  allowed?: string[];

  constructor(
    message = 'Invalid variant selection.',
    options?: {
      productId?: string;
      field?: 'selectedSize' | 'selectedColor';
      value?: string;
      allowed?: string[];
    }
  ) {
    super(message);
    this.name = 'InvalidVariantError';
    this.productId = options?.productId;
    this.field = options?.field;
    this.value = options?.value;
    this.allowed = options?.allowed;
  }
}

export class PriceConfigError extends Error {
  code = 'PRICE_CONFIG_ERROR' as const;
  productId?: string;
  currency?: string;
  constructor(
    message = 'Price not configured for currency.',
    options?: { productId?: string; currency?: string }
  ) {
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

export class OrderStateInvalidError extends Error {
  code = 'ORDER_STATE_INVALID' as const;
  orderId?: string;
  field?: string;
  rawValue?: unknown;
  details?: Record<string, unknown>;

  constructor(
    message = 'Order state is invalid.',
    options?: {
      orderId?: string;
      field?: string;
      rawValue?: unknown;
      details?: Record<string, unknown>;
    }
  ) {
    super(message);
    this.name = 'OrderStateInvalidError';
    this.orderId = options?.orderId;
    this.field = options?.field;
    this.rawValue = options?.rawValue;
    this.details = options?.details;
  }
}
