import { resolveStandardStorefrontProviderCapabilities } from '@/lib/shop/commercial-policy.server';

export function resolveStripeCheckoutEnabled(): boolean {
  return resolveStandardStorefrontProviderCapabilities().stripeCheckoutEnabled;
}

export function resolveMonobankCheckoutEnabled(): boolean {
  return resolveStandardStorefrontProviderCapabilities().monobankCheckoutEnabled;
}

export function resolveMonobankGooglePayEnabled(): boolean {
  return resolveStandardStorefrontProviderCapabilities()
    .monobankGooglePayEnabled;
}
