import { beforeEach, describe, expect, it, vi } from 'vitest';

const readServerEnvMock = vi.hoisted(() => vi.fn());
const isMonobankEnabledMock = vi.hoisted(() => vi.fn());
const isStripePaymentsEnabledMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/env/server-env', () => ({
  readServerEnv: (key: string) => readServerEnvMock(key),
}));

vi.mock('@/lib/env/monobank', () => ({
  isMonobankEnabled: () => isMonobankEnabledMock(),
}));

vi.mock('@/lib/env/stripe', () => ({
  isPaymentsEnabled: (args?: unknown) => isStripePaymentsEnabledMock(args),
}));

describe('public cart env contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('resolves monobank checkout from readServerEnv PAYMENTS_ENABLED before checking provider capability', async () => {
    readServerEnvMock.mockImplementation((key: string) =>
      key === 'PAYMENTS_ENABLED' ? 'true' : undefined
    );
    isMonobankEnabledMock.mockReturnValue(true);

    const mod = await import('@/app/[locale]/shop/cart/capabilities');
    const enabled = mod.resolveMonobankCheckoutEnabled();

    expect(enabled).toBe(true);
    expect(readServerEnvMock).toHaveBeenCalledWith('PAYMENTS_ENABLED');
    expect(isMonobankEnabledMock).toHaveBeenCalledTimes(1);
  });

  it('does not check monobank provider capability when readServerEnv PAYMENTS_ENABLED is disabled', async () => {
    readServerEnvMock.mockImplementation(() => 'false');

    const mod = await import('@/app/[locale]/shop/cart/capabilities');
    const enabled = mod.resolveMonobankCheckoutEnabled();

    expect(enabled).toBe(false);
    expect(readServerEnvMock).toHaveBeenCalledWith('PAYMENTS_ENABLED');
    expect(isMonobankEnabledMock).not.toHaveBeenCalled();
  });

  it('treats normalized truthy env values as enabled for capability resolution', async () => {
    readServerEnvMock.mockImplementation((key: string) => {
      if (key === 'PAYMENTS_ENABLED') return ' YES ';
      if (key === 'SHOP_MONOBANK_GPAY_ENABLED') return ' On ';
      return undefined;
    });
    isMonobankEnabledMock.mockReturnValue(true);

    const mod = await import('@/app/[locale]/shop/cart/capabilities');

    expect(mod.resolveMonobankCheckoutEnabled()).toBe(true);
    expect(mod.resolveMonobankGooglePayEnabled()).toBe(true);
    expect(readServerEnvMock).toHaveBeenCalledWith('PAYMENTS_ENABLED');
    expect(readServerEnvMock).toHaveBeenCalledWith(
      'SHOP_MONOBANK_GPAY_ENABLED'
    );
  });

  it('resolves monobank google pay from readServerEnv SHOP_MONOBANK_GPAY_ENABLED', async () => {
    readServerEnvMock.mockImplementation((key: string) => {
      if (key === 'PAYMENTS_ENABLED') return 'true';
      if (key === 'SHOP_MONOBANK_GPAY_ENABLED') return 'on';
      return undefined;
    });
    isMonobankEnabledMock.mockReturnValue(true);

    const mod = await import('@/app/[locale]/shop/cart/capabilities');
    const enabled = mod.resolveMonobankGooglePayEnabled();

    expect(enabled).toBe(true);
    expect(readServerEnvMock).toHaveBeenCalledWith('PAYMENTS_ENABLED');
    expect(readServerEnvMock).toHaveBeenCalledWith(
      'SHOP_MONOBANK_GPAY_ENABLED'
    );
  });

  it('reads legal versions through readServerEnv and keeps existing defaults', async () => {
    readServerEnvMock.mockImplementation((key: string) => {
      if (key === 'SHOP_TERMS_VERSION') return 'terms-v7';
      if (key === 'SHOP_PRIVACY_VERSION') return undefined;
      return undefined;
    });

    const mod = await import('@/lib/env/shop-legal');
    const versions = mod.getShopLegalVersions();

    expect(versions).toEqual({
      termsVersion: 'terms-v7',
      privacyVersion: 'privacy-v1',
    });
    expect(readServerEnvMock).toHaveBeenCalledWith('SHOP_TERMS_VERSION');
    expect(readServerEnvMock).toHaveBeenCalledWith('SHOP_PRIVACY_VERSION');
  });
});
