/**
 * Canonical money helpers to avoid floating-point drift between DB, Stripe and UI.
 *
 * All arithmetic is done in integer cents and converted back to a 2-decimal number
 * only at the boundaries (DB writes/reads, API responses).
 */
export type Money = number

export type MoneyCents = number

function parseAmount(value: unknown): number {
  const parsed = typeof value === "string" ? value.trim() : value
  const numeric = typeof parsed === "string" && parsed.length > 0 ? Number(parsed) : Number(parsed)

  if (!Number.isFinite(numeric)) {
    throw new Error("Invalid money value")
  }

  return numeric
}

function assertIntegerCents(cents: number): MoneyCents {
  if (!Number.isFinite(cents)) {
    throw new Error("Invalid money value")
  }

  return Math.trunc(cents)
}

/**
 * Convert a decimal amount (e.g. 12.34) to an integer amount in cents.
 */
export function toCents(value: number | string): MoneyCents {
  const parsed = parseAmount(value)
  const cents = Math.round(parsed * 100)
  return assertIntegerCents(cents)
}

/**
 * Convert integer cents back to a 2-decimal money representation.
 */
export function fromCents(cents: MoneyCents): Money {
  return Number((assertIntegerCents(cents) / 100).toFixed(2))
}

/**
 * Read a DECIMAL(10,2) value from the DB and convert it to integer cents.
 */
export function fromDbMoney(value: unknown): MoneyCents {
  return toCents(value as number | string)
}

/**
 * Normalize integer cents to a DB-friendly decimal string.
 */
export function toDbMoney(cents: MoneyCents): string {
  return (assertIntegerCents(cents) / 100).toFixed(2)
}

/**
 * Compute a line total from a unit price (in cents) and quantity using integer arithmetic.
 */
export function calculateLineTotal(unitPriceCents: MoneyCents, quantity: number): MoneyCents {
  return assertIntegerCents(unitPriceCents) * Math.trunc(quantity)
}

/**
 * Sum line totals already expressed in cents.
 */
export function sumLineTotals(lineTotals: MoneyCents[]): MoneyCents {
  return lineTotals.reduce((total, cents) => assertIntegerCents(total) + assertIntegerCents(cents), 0)
}
