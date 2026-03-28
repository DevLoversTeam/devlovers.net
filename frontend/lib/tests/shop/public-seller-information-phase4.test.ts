import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ENV_KEYS = [
  'NP_SENDER_NAME',
  'NP_SENDER_PHONE',
  'NP_SENDER_EDRPOU',
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

  it('keeps the public seller source neutral when legal identity fields are missing', async () => {
    vi.stubEnv('NP_SENDER_NAME', 'Test Merchant');
    vi.stubEnv('NP_SENDER_PHONE', '+380501112233');

    const { getPublicSellerInformation } =
      await import('@/lib/legal/public-seller-information');

    const seller = getPublicSellerInformation();

    expect(seller).toMatchObject({
      sellerName: 'Test Merchant',
      supportPhone: '+380501112233',
      address: null,
      businessDetails: [],
    });
    expect(seller).not.toHaveProperty('missingFields');
    expect(seller).not.toHaveProperty('isComplete');
  });
});
