export class InvalidPayloadError extends Error {
  code = "INVALID_PAYLOAD" as const
}

export class InsufficientStockError extends Error {
  code = "INSUFFICIENT_STOCK" as const
}

export class OrderNotFoundError extends Error {
  code = "ORDER_NOT_FOUND" as const
}

export class SlugConflictError extends Error {
  code = "SLUG_CONFLICT" as const
}
