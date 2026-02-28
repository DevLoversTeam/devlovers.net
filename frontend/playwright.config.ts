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
    command: 'npm run dev -- -p 3100 -H 127.0.0.1',
    port: 3100,
    timeout: 120_000,
    reuseExistingServer: true,
    env: {
      APP_ENV: 'local',
      DATABASE_URL_LOCAL: LOCAL_DB_URL,
      DATABASE_URL: '',
      SHOP_STRICT_LOCAL_DB: '1',
      SHOP_REQUIRED_DATABASE_URL_LOCAL: LOCAL_DB_URL,
      SHOP_STATUS_TOKEN_SECRET:
        'test_status_token_secret_test_status_token_secret',
      NODE_ENV: 'test',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  },
});
