export type Money = number;
export type MoneyCents = number;

function parseAmount(value: unknown): number {
  const parsed = typeof value === "string" ? value.trim() : value;

  if (typeof parsed !== "string" && typeof parsed !== "number") {
    throw new Error("Invalid money value");
  }

  const numeric =
    typeof parsed === "string" && parsed.length > 0 ? Number(parsed) : Number(parsed);

  if (!Number.isFinite(numeric)) {
    throw new Error("Invalid money value");
  }

  if (numeric < 0) {
    throw new Error("Invalid money value");
  }

  return numeric;
}

/**
 * Strict invariant for canonical minor-units:
 * - finite
 * - integer (no trunc/round normalization here)
 * - >= 0
 */
export function assertIntegerCentsStrict(cents: number): MoneyCents {
  if (!Number.isFinite(cents) || !Number.isInteger(cents) || cents < 0) {
    throw new Error("Invalid money cents value");
  }
  return cents;
}

export function toCents(value: number | string): MoneyCents {
  const parsed = parseAmount(value);
  const cents = Math.round(parsed * 100);
  return assertIntegerCentsStrict(cents);
}

export function fromCents(cents: MoneyCents): Money {
  return Number((assertIntegerCentsStrict(cents) / 100).toFixed(2));
}

/**
 * Legacy DB numeric money (string/number like "12.34") -> canonical cents (int >= 0).
 */
export function fromDbMoney(value: unknown): MoneyCents {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new Error("Invalid money value");
  }
  return toCents(value);
}

export function toDbMoney(cents: MoneyCents): string {
  return (assertIntegerCentsStrict(cents) / 100).toFixed(2);
}

export function calculateLineTotal(unitPriceCents: MoneyCents, quantity: number): MoneyCents {
  if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("Invalid quantity");
  }
  return assertIntegerCentsStrict(assertIntegerCentsStrict(unitPriceCents) * quantity);
}


export function sumLineTotals(lineTotals: MoneyCents[]): MoneyCents {
  let total = 0;
  for (const cents of lineTotals) {
    total = assertIntegerCentsStrict(total + assertIntegerCentsStrict(cents));
  }
  return total;
}
