export type Money = number;
export type MoneyCents = number;

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

function parseMajorToMinor(input: string | number): MoneyCents {
  const raw = typeof input === 'string' ? input.trim() : String(input);

  if (!raw.length) throw new Error('Invalid money value');

  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 0)
      throw new Error('Invalid money value');
  }
  const s = raw;

  if (s.startsWith('-')) throw new Error('Invalid money value');
  if (isScientificNotation(s)) {
    throw new Error('Invalid money value');
  }

  const normalized = s.startsWith('.') ? `0${s}` : s;

  const m = normalized.match(/^(\d+)(?:\.(\d+))?$/);
  if (!m) throw new Error('Invalid money value');

  const intStr = m[1] ?? '0';
  const fracStrRaw = m[2] ?? '';

  const maxIntPart = Math.floor(Number.MAX_SAFE_INTEGER / 100);
  const intPart = Number(intStr);
  if (!Number.isSafeInteger(intPart) || intPart < 0 || intPart > maxIntPart) {
    throw new Error('Invalid money value');
  }

  let frac2 = fracStrRaw.slice(0, 2);
  while (frac2.length < 2) frac2 += '0';

  let cents = Number(frac2);
  if (!Number.isInteger(cents) || cents < 0 || cents > 99) {
    throw new Error('Invalid money value');
  }

  if (fracStrRaw.length > 2) {
    const third = fracStrRaw.charCodeAt(2) - 48;
    if (third >= 5) {
      cents += 1;
      if (cents === 100) {
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

export function toCents(value: number | string): MoneyCents {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new Error('Invalid money value');
  }
  return parseMajorToMinor(value);
}

export function fromCents(cents: MoneyCents): Money {
  const v = assertIntegerCentsStrict(cents);
  const intPart = Math.floor(v / 100);
  const frac = v % 100;

  return Number(`${intPart}.${String(frac).padStart(2, '0')}`);
}

export function fromDbMoney(value: unknown): MoneyCents {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new Error('Invalid money value');
  }
  return toCents(value);
}

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
