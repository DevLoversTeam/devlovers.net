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

export class InvalidPayloadError extends Error {
  code: string;
  details?: Record<string, unknown>;

  constructor(
    message = 'Invalid payload',
    opts?: { code?: string; details?: Record<string, unknown> }
  ) {
    super(message);
    this.name = 'InvalidPayloadError';
    this.code = opts?.code ?? 'INVALID_PAYLOAD';
    this.details = opts?.details;
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
  readonly code = 'ORDER_STATE_INVALID' as const;

  readonly orderId?: string;
  readonly field?: string;
  readonly rawValue?: unknown;
  readonly details?: unknown;

  constructor(
    message: string,
    opts?: {
      orderId?: string;
      field?: string;
      rawValue?: unknown;
      details?: unknown;
    }
  ) {
    super(message);
    this.name = 'OrderStateInvalidError';
    this.orderId = opts?.orderId;
    this.field = opts?.field;
    this.rawValue = opts?.rawValue;
    this.details = opts?.details;
  }
}

export class PspUnavailableError extends Error {
  readonly code = 'PSP_UNAVAILABLE' as const;
  readonly orderId?: string;
  readonly requestId?: string;

  constructor(
    message = 'PSP unavailable',
    opts?: { orderId?: string; requestId?: string }
  ) {
    super(message);
    this.name = 'PspUnavailableError';
    this.orderId = opts?.orderId;
    this.requestId = opts?.requestId;
  }
}

export class PspInvoicePersistError extends Error {
  readonly code = 'PSP_INVOICE_PERSIST_FAILED' as const;
  readonly orderId?: string;

  constructor(
    message = 'Failed to persist PSP invoice',
    opts?: { orderId?: string }
  ) {
    super(message);
    this.name = 'PspInvoicePersistError';
    this.orderId = opts?.orderId;
  }
}
