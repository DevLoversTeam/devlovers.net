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

export function toCents(value: number | string): MoneyCents {
  const parsed = parseAmount(value)
  const cents = Math.round(parsed * 100)
  return assertIntegerCents(cents)
}

export function fromCents(cents: MoneyCents): Money {
  return Number((assertIntegerCents(cents) / 100).toFixed(2))
}

export function fromDbMoney(value: unknown): MoneyCents {
  return toCents(value as number | string)
}

export function toDbMoney(cents: MoneyCents): string {
  return (assertIntegerCents(cents) / 100).toFixed(2)
}

export function calculateLineTotal(unitPriceCents: MoneyCents, quantity: number): MoneyCents {
  return assertIntegerCents(unitPriceCents) * Math.trunc(quantity)
}

export function sumLineTotals(lineTotals: MoneyCents[]): MoneyCents {
  return lineTotals.reduce((total, cents) => assertIntegerCents(total) + assertIntegerCents(cents), 0)
}
