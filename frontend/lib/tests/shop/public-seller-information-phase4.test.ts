import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getTranslationsMock = vi.hoisted(() =>
  vi.fn(
    async (
      input?:
        | string
        | {
            locale?: string;
            namespace?: string;
          }
    ) => {
      const namespace =
        typeof input === 'string' ? input : (input?.namespace ?? '');

      return (key: string) => `${namespace}.${key}`;
    }
  )
);

vi.mock('next-intl/server', () => ({
  getTranslations: getTranslationsMock,
}));

const ENV_KEYS = [
  'NP_SENDER_NAME',
  'NP_SENDER_PHONE',
  'NP_SENDER_EDRPOU',
  'SHOP_SELLER_ADDRESS',
] as const;

const previousEnv: Partial<
  Record<(typeof ENV_KEYS)[number], string | undefined>
> = {};

function restoreEnv() {
  for (const key of ENV_KEYS) {
    const value = previousEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe('public seller information contract', () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) {
      previousEnv[key] = process.env[key];
      delete process.env[key];
    }
    vi.resetModules();
  });

  afterEach(() => {
    restoreEnv();
    vi.resetModules();
  });

  it('keeps seller address unset in the public seller source when the address env is missing', async () => {
    vi.stubEnv('NP_SENDER_NAME', 'Test Merchant');
    vi.stubEnv('NP_SENDER_PHONE', '+380501112233');
    vi.stubEnv('NP_SENDER_EDRPOU', '12345678');

    const { getPublicSellerInformation } =
      await import('@/lib/legal/public-seller-information');

    const seller = getPublicSellerInformation();

    expect(seller).toMatchObject({
      sellerName: 'Test Merchant',
      supportPhone: '+380501112233',
      address: null,
      businessDetails: [{ label: 'EDRPOU', value: '12345678' }],
    });
    expect(seller).not.toHaveProperty('missingFields');
    expect(seller).not.toHaveProperty('isComplete');
  });

  it('keeps the existing seller-information placeholder behavior when the address env is missing', async () => {
    vi.stubEnv('NP_SENDER_NAME', 'Test Merchant');
    vi.stubEnv('NP_SENDER_PHONE', '+380501112233');
    vi.stubEnv('NP_SENDER_EDRPOU', '12345678');

    const { default: SellerInformationContent } =
      await import('@/components/legal/SellerInformationContent');

    const html = renderToStaticMarkup(await SellerInformationContent());

    expect(html).toContain('legal.seller.placeholders.toBeAdded');
    expect(html).toContain('Test Merchant');
    expect(html).toContain('+380501112233');
  });

  it('surfaces the configured public seller address when the address env is set', async () => {
    vi.stubEnv('NP_SENDER_NAME', 'Test Merchant');
    vi.stubEnv('NP_SENDER_PHONE', '+380501112233');
    vi.stubEnv('NP_SENDER_EDRPOU', '12345678');
    vi.stubEnv('SHOP_SELLER_ADDRESS', 'Kyiv, Main Street 1');

    const { getPublicSellerInformation } =
      await import('@/lib/legal/public-seller-information');
    const { default: SellerInformationContent } =
      await import('@/components/legal/SellerInformationContent');

    expect(getPublicSellerInformation()).toMatchObject({
      address: 'Kyiv, Main Street 1',
    });

    const html = renderToStaticMarkup(await SellerInformationContent());

    expect(html).toContain('Kyiv, Main Street 1');
    expect(html).not.toContain('legal.seller.placeholders.toBeAdded');
  });
});
