const IDEMPOTENCY_MAX_LENGTH = 128

function fallbackKey(): string {
  const random = Math.random().toString(36).slice(2)
  const timestamp = Date.now().toString(36)
  return `${timestamp}_${random}`.slice(0, IDEMPOTENCY_MAX_LENGTH)
}

export function generateIdempotencyKey(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID().replace(/[^A-Za-z0-9_-]/g, "").slice(0, IDEMPOTENCY_MAX_LENGTH)
    }
  } catch {
    // ignore and use fallback
  }

  return fallbackKey()
}
