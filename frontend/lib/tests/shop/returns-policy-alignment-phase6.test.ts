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

const localeCases = [
  {
    locale: 'en',
    messages: en,
    reviewRequired: 'Exchanges are not supported.',
    refundsRequired:
      'Self-service refund processing through the storefront is not currently available.',
    refundsForbidden:
      'Automatic refund processing through the website is not currently available.',
    contactRequired: 'return or cancellation guidance',
  },
  {
    locale: 'uk',
    messages: uk,
    reviewRequired: 'Обмін наразі не підтримується.',
    refundsRequired:
      'Самостійне повернення коштів через вітрину магазину наразі недоступне.',
    refundsForbidden:
      'Автоматичне повернення коштів через сайт наразі недоступне.',
    contactRequired: 'повернення, скасування',
  },
  {
    locale: 'pl',
    messages: pl,
    reviewRequired: 'Wymiany nie są obsługiwane.',
    refundsRequired:
      'Samodzielne zwroty środków przez witrynę sklepu nie są obecnie dostępne.',
    refundsForbidden:
      'Automatyczne zwroty przez stronę internetową nie są obecnie dostępne.',
    contactRequired: 'zwrotu, anulowania',
  },
] as const;

describe('returns policy alignment phase 6', () => {
  it.each(localeCases)(
    'keeps public returns wording aligned with current runtime for locale $locale',
    ({
      messages,
      reviewRequired,
      refundsRequired,
      refundsForbidden,
      contactRequired,
    }) => {
      const review = String(
        getAtPath(messages as Record<string, unknown>, [
          'legal',
          'returns',
          'review',
          'body',
        ]) ?? ''
      );
      const refunds = String(
        getAtPath(messages as Record<string, unknown>, [
          'legal',
          'returns',
          'refunds',
          'body',
        ]) ?? ''
      );
      const contact = String(
        getAtPath(messages as Record<string, unknown>, [
          'legal',
          'returns',
          'contact',
          'body',
        ]) ?? ''
      );

      expect(review).toContain(reviewRequired);
      expect(refunds).toContain(refundsRequired);
      expect(refunds).not.toContain(refundsForbidden);
      expect(contact).toContain(contactRequired);
    }
  );
});
