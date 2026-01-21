export type Money = number;      // legacy/display only
export type MoneyCents = number; // canonical minor units (safe int >= 0)

/**
 * Strict invariant for canonical minor-units:
 * - finite
 * - integer (no trunc/round normalization here)
 * - >= 0
 * - safe integer
 */
export function assertIntegerCentsStrict(cents: number): MoneyCents {
  if (!Number.isFinite(cents) || !Number.isInteger(cents) || cents < 0) {
    throw new Error('Invalid money cents value');
  }
  if (!Number.isSafeInteger(cents)) {
    throw new Error('Money cents exceeds JS safe integer range');
  }
  return cents;
}

function assertPositiveInteger(name: string, v: number): number {
  if (!Number.isFinite(v) || !Number.isInteger(v) || v <= 0) {
    throw new Error(`Invalid ${name}`);
  }
  if (!Number.isSafeInteger(v)) {
    throw new Error(`${name} exceeds JS safe integer range`);
  }
  return v;
}

function isScientificNotation(s: string): boolean {
  return /e[+-]?\d+/i.test(s);
}

/**
 * Parse decimal "major units" string/number into minor units (cents) WITHOUT floats.
 * Rules:
 * - accepts: "12", "12.3", "12.34", ".5", "0.5"
 * - rejects: negatives, NaN/Infinity, scientific notation ("1e-3"), non-numeric
 * - rounds HALF_UP to 2 decimals if more than 2 fractional digits
 */
function parseMajorToMinor(input: string | number): MoneyCents {
  const raw =
    typeof input === 'string'
      ? input.trim()
      : Number.isFinite(input)
        ? String(input)
        : String(input);

  if (!raw.length) throw new Error('Invalid money value');

  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 0) throw new Error('Invalid money value');
  }

  const s = raw;

  if (s.startsWith('-')) throw new Error('Invalid money value');
  if (isScientificNotation(s)) {
    // JS numbers can stringify to "1e-7" – refuse to avoid ambiguous rounding
    throw new Error('Invalid money value');
  }

  // Normalize leading-dot ".5" -> "0.5"
  const normalized = s.startsWith('.') ? `0${s}` : s;

  // Accept only digits with optional single dot
  const m = normalized.match(/^(\d+)(?:\.(\d+))?$/);
  if (!m) throw new Error('Invalid money value');

  const intStr = m[1] ?? '0';
  const fracStrRaw = m[2] ?? '';

  // int part safe range pre-check
  const maxIntPart = Math.floor(Number.MAX_SAFE_INTEGER / 100);
  const intPart = Number(intStr);
  if (!Number.isSafeInteger(intPart) || intPart < 0 || intPart > maxIntPart) {
    throw new Error('Invalid money value');
  }

  // Fractional rounding to 2 digits, HALF_UP
  let frac2 = fracStrRaw.slice(0, 2);
  while (frac2.length < 2) frac2 += '0';

  let cents = Number(frac2);
  if (!Number.isInteger(cents) || cents < 0 || cents > 99) {
    throw new Error('Invalid money value');
  }

  // Round if there are extra digits beyond 2
  if (fracStrRaw.length > 2) {
    const third = fracStrRaw.charCodeAt(2) - 48; // '0' => 0
    if (third >= 5) {
      cents += 1;
      if (cents === 100) {
        // carry
        cents = 0;
        if (intPart + 1 > maxIntPart) throw new Error('Invalid money value');
        const minor = (intPart + 1) * 100 + cents;
        return assertIntegerCentsStrict(minor);
      }
    }
  }

  const minor = intPart * 100 + cents;
  return assertIntegerCentsStrict(minor);
}

/**
 * Public API: major -> cents (minor).
 * NOTE: prefer passing strings from DB/inputs; numbers are accepted but may be rejected
 * if they stringify to scientific notation.
 */
export function toCents(value: number | string): MoneyCents {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new Error('Invalid money value');
  }
  return parseMajorToMinor(value);
}

/**
 * Minor -> legacy major number (display only).
 * Still returns a JS number; do NOT use for money comparisons.
 */
export function fromCents(cents: MoneyCents): Money {
  const v = assertIntegerCentsStrict(cents);
  const intPart = Math.floor(v / 100);
  const frac = v % 100;
  // Controlled string -> number (display only)
  return Number(`${intPart}.${String(frac).padStart(2, '0')}`);
}

/**
 * Legacy DB numeric money (string/number like "12.34") -> canonical cents (int >= 0).
 * No floats.
 */
export function fromDbMoney(value: unknown): MoneyCents {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new Error('Invalid money value');
  }
  return toCents(value);
}

/**
 * Canonical cents -> DB decimal string "12.34" WITHOUT floats/toFixed.
 */
export function toDbMoney(cents: MoneyCents): string {
  const v = assertIntegerCentsStrict(cents);
  const intPart = Math.floor(v / 100);
  const frac = v % 100;
  return `${intPart}.${String(frac).padStart(2, '0')}`;
}

export function calculateLineTotal(
  unitPriceCents: MoneyCents,
  quantity: number
): MoneyCents {
  const price = assertIntegerCentsStrict(unitPriceCents);
  const qty = assertPositiveInteger('quantity', quantity);

  const total = price * qty;

  if (!Number.isSafeInteger(total)) {
    throw new Error('Line total exceeds JS safe integer range');
  }

  return assertIntegerCentsStrict(total);
}

export function sumLineTotals(lineTotals: MoneyCents[]): MoneyCents {
  let total = 0;
  for (const cents of lineTotals) {
    const v = assertIntegerCentsStrict(cents);
    const next = total + v;
    if (!Number.isSafeInteger(next)) {
      throw new Error('Sum exceeds JS safe integer range');
    }
    total = next;
  }
  return assertIntegerCentsStrict(total);
}
