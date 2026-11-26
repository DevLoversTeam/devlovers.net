import { getAtPath } from '@/lib/tests/helpers/get-at-path';
import en from '@/messages/en.json';
import pl from '@/messages/pl.json';
import uk from '@/messages/uk.json';

describe('admin orders i18n messages', () => {
  it('shares the payment status label and keeps the apply label under the admin filters', () => {
    for (const messages of [en, uk, pl]) {
      expect(
        getAtPath(messages as Record<string, unknown>, [
          'shop',
          'orders',
          'paymentStatusLabel',
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
    for (const messages of [en, uk, pl]) {
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
