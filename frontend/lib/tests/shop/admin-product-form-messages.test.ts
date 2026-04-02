import { describe, expect, it } from 'vitest';

import en from '@/messages/en.json';
import pl from '@/messages/pl.json';
import uk from '@/messages/uk.json';

function getAtPath(
  root: Record<string, unknown>,
  path: readonly string[]
): unknown {
  let current: unknown = root;

  for (const segment of path) {
    if (!current || typeof current !== 'object' || !(segment in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

describe('admin product form i18n messages', () => {
  it('keeps product form labels under shop.admin.products.form for all supported locales', () => {
    for (const [locale, messages] of [
      ['en', en],
      ['uk', uk],
      ['pl', pl],
    ] as const) {
      for (const path of [
        ['shop', 'admin', 'products', 'form', 'fields', 'title'],
        ['shop', 'admin', 'products', 'form', 'pricing', 'helper'],
        [
          'shop',
          'admin',
          'products',
          'form',
          'errors',
          'legacyPhotoMigrationRequired',
        ],
        ['shop', 'admin', 'products', 'form', 'actions', 'save'],
      ] as const) {
        const resolved = getAtPath(messages as Record<string, unknown>, path);

        expect(
          resolved,
          `Missing ${path.join('.')} for locale ${locale}`
        ).toBeTruthy();
      }
    }
  });
});
