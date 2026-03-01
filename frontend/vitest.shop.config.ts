import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': __dirname,
      'server-only': path.join(__dirname, 'lib/tests/__mocks__/server-only.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['lib/tests/shop/**/*.test.ts'],
    globals: true,
    setupFiles: ['./vitest.setup.ts', './lib/tests/shop/setup.ts'],
  },
});
