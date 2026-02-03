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
    include: [
      'lib/tests/**/*.test.ts',
      'components/tests/**/*.test.tsx',
      'components/quiz/tests/**/*.test.tsx',
    ],
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'lib/quiz/**',
        'hooks/**',
        'app/api/quiz/**',
        'components/q&a/**',
        'app/api/questions/**',
      ],
    },
  },
});
