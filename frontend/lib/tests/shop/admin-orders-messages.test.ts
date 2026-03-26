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

describe('admin orders i18n messages', () => {
  it('keeps order filter labels under shop.admin.orders for all supported locales', () => {
    for (const messages of [en, uk, pl]) {
      expect(
        getAtPath(messages as Record<string, unknown>, [
          'shop',
          'admin',
          'orders',
          'filters',
          'status',
        ])
      ).toBeTruthy();

      expect(
        getAtPath(messages as Record<string, unknown>, [
          'shop',
          'admin',
          'orders',
          'filters',
          'apply',
        ])
      ).toBeTruthy();
    }
  });

  it('does not keep order filter labels under shop.admin.products', () => {
    for (const messages of [uk, pl]) {
      expect(
        getAtPath(messages as Record<string, unknown>, [
          'shop',
          'admin',
          'products',
          'filters',
        ])
      ).toBeUndefined();
    }
  });
});
