import { resolveCurrentStandardStorefrontShippingCountryFromLocale } from '@/lib/shop/commercial-policy';

export function localeToCountry(
  input: string | null | undefined
): string | null {
  return resolveCurrentStandardStorefrontShippingCountryFromLocale(input);
}

export const countryFromLocale = localeToCountry;
