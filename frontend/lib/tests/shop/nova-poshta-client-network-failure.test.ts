import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetEnvCache } from '@/lib/env';
import {
  NovaPoshtaApiError,
  getWarehousesBySettlementRef,
  searchSettlements,
} from '@/lib/services/shop/shipping/nova-poshta-client';

function stubRequiredNpEnv() {
  vi.stubEnv('DATABASE_URL', 'https://example.com/db');
  vi.stubEnv('SHOP_SHIPPING_ENABLED', 'true');
  vi.stubEnv('SHOP_SHIPPING_NP_ENABLED', 'true');
  vi.stubEnv('NP_API_BASE', 'https://np.invalid/v2.0/json/');
  vi.stubEnv('NP_API_KEY', 'test-key');
  vi.stubEnv('NP_SENDER_CITY_REF', 'city-ref');
  vi.stubEnv('NP_SENDER_WAREHOUSE_REF', 'warehouse-ref');
  vi.stubEnv('NP_SENDER_REF', 'sender-ref');
  vi.stubEnv('NP_SENDER_CONTACT_REF', 'contact-ref');
  vi.stubEnv('NP_SENDER_NAME', 'DevLovers');
  vi.stubEnv('NP_SENDER_PHONE', '+380000000000');
}

describe('nova poshta client network failure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    stubRequiredNpEnv();
    resetEnvCache();
  });

  it('wraps fetch throw in NovaPoshtaApiError for searchSettlements', async () => {
    const fetchError = new TypeError('fetch failed');
    const fetchMock = vi.fn().mockRejectedValue(fetchError);
    vi.stubGlobal('fetch', fetchMock);

    try {
      await searchSettlements({ q: 'kyiv', page: 1, limit: 10 });
      throw new Error('expected searchSettlements to throw');
    } catch (error) {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(error).toBeInstanceOf(NovaPoshtaApiError);
      expect(error).toMatchObject({
        code: 'NP_FETCH_FAILED',
        status: 0,
        message: 'fetch failed',
      });
      expect((error as NovaPoshtaApiError & { cause?: unknown }).cause).toBe(fetchError);
    }
  });

  it('wraps fetch throw in NovaPoshtaApiError for getWarehousesBySettlementRef', async () => {
    const fetchError = new TypeError('fetch failed');
    const fetchMock = vi.fn().mockRejectedValue(fetchError);
    vi.stubGlobal('fetch', fetchMock);

    try {
      await getWarehousesBySettlementRef('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
      throw new Error('expected getWarehousesBySettlementRef to throw');
    } catch (error) {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(error).toBeInstanceOf(NovaPoshtaApiError);
      expect(error).toMatchObject({
        code: 'NP_FETCH_FAILED',
        status: 0,
        message: 'fetch failed',
      });
      expect((error as NovaPoshtaApiError & { cause?: unknown }).cause).toBe(fetchError);
    }
  });
});
