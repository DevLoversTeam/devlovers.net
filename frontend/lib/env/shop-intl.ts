import 'server-only';

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export function getIntlAcceptedPaymentTtlMinutes(): number {
  return parsePositiveInt(
    process.env.SHOP_INTL_ACCEPTED_PAYMENT_TTL_MINUTES,
    30
  );
}

export function getIntlQuoteOfferTtlMinutes(): number {
  return parsePositiveInt(process.env.SHOP_INTL_QUOTE_OFFER_TTL_MINUTES, 1440);
}
