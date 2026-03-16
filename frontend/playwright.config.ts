import { defineConfig } from '@playwright/test';

const LOCAL_DB_URL =
  'postgresql://devlovers_local:Gfdtkk43@localhost:5432/devlovers_shop_local_clean?sslmode=disable';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /.*\.spec\.ts$/,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && npm run start -- -p 3100 -H 127.0.0.1',
    port: 3100,
    timeout: 300_000,
    reuseExistingServer: process.env.PW_REUSE_EXISTING_SERVER === '1',
    env: {
      APP_ENV: 'local',
      DATABASE_URL_LOCAL: LOCAL_DB_URL,
      SHOP_STRICT_LOCAL_DB: '1',
      SHOP_REQUIRED_DATABASE_URL_LOCAL: LOCAL_DB_URL,
      SHOP_STATUS_TOKEN_SECRET:
        'test_status_token_secret_test_status_token_secret',
      PAYMENTS_ENABLED: 'true',
      MONO_MERCHANT_TOKEN: 'e2e_local_monobank_token',
      MONO_API_BASE: 'http://127.0.0.1:9999',
      SHOP_MONOBANK_GPAY_ENABLED: 'true',
      MONO_GOOGLE_PAY_GATEWAY_MERCHANT_ID: 'e2e_local_monobank_gateway',
      MONO_GOOGLE_PAY_MERCHANT_NAME: 'DevLovers Local E2E',
      SHOP_SHIPPING_ENABLED: 'true',
      SHOP_SHIPPING_NP_ENABLED: 'true',
      APP_ORIGIN: 'http://127.0.0.1:3100',
      APP_ADDITIONAL_ORIGINS: 'http://localhost:3100,http://127.0.0.1:3100',
      NODE_ENV: 'test',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  },
});
