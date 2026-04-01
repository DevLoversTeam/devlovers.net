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
    for (const messages of [en, uk, pl]) {
      expect(
        getAtPath(messages as Record<string, unknown>, [
          'shop',
          'admin',
          'products',
          'form',
          'fields',
          'title',
        ])
      ).toBeTruthy();

      expect(
        getAtPath(messages as Record<string, unknown>, [
          'shop',
          'admin',
          'products',
          'form',
          'pricing',
          'helper',
        ])
      ).toBeTruthy();

      expect(
        getAtPath(messages as Record<string, unknown>, [
          'shop',
          'admin',
          'products',
          'form',
          'errors',
          'legacyPhotoMigrationRequired',
        ])
      ).toBeTruthy();

      expect(
        getAtPath(messages as Record<string, unknown>, [
          'shop',
          'admin',
          'products',
          'form',
          'actions',
          'save',
        ])
      ).toBeTruthy();
    }
  });
});
