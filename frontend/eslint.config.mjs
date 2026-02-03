import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import reactHooks from 'eslint-plugin-react-hooks';
import simpleImportSort from 'eslint-plugin-simple-import-sort';

export default defineConfig([
  ...nextVitals,
  ...nextTs,

  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    '_dev-notes/**',
  ]),

  {
    plugins: {
      'react-hooks': reactHooks,
      'simple-import-sort': simpleImportSort,
    },

    rules: {
      /**
       * React hooks — must have
       */
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      /**
       * Import sorting (auto-fix)
       */
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',

      /**
       * TS relax
       */
      '@typescript-eslint/no-explicit-any': 'off',

      /**
       * Let Prettier handle formatting
       */
      'react/jsx-curly-newline': 'off',
    },
  },
]);
