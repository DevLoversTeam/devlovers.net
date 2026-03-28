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
  ['en', en],
  ['uk', uk],
  ['pl', pl],
] as const;

const cookieAlignmentCases = [
  {
    locale: 'en',
    messages: en,
    bannerRequired: ['cookies and local storage', 'signed in', 'preferences'],
    bannerForbidden: ['personalized content', 'analyze our traffic'],
    privacyRequired: ['cookies/local storage', 'signed in', 'preferences'],
  },
  {
    locale: 'uk',
    messages: uk,
    bannerRequired: [
      'cookie та локальне сховище',
      'авторизації',
      'налаштувань',
    ],
    bannerForbidden: ['персоналізації контенту', 'аналізу трафіку'],
    privacyRequired: ['cookie/локальне сховище', 'авторизації', 'налаштувань'],
  },
  {
    locale: 'pl',
    messages: pl,
    bannerRequired: [
      'plików cookie i lokalnego magazynu',
      'zalogowanego',
      'preferencje',
    ],
    bannerForbidden: ['spersonalizowane treści', 'analizować nasz ruch'],
    privacyRequired: [
      'plików cookie/lokalnego magazynu',
      'zalogowanego',
      'preferencje',
    ],
  },
] as const;

describe('legal cookie/privacy alignment phase 4', () => {
  it.each(localeCases)(
    'keeps checkout consent keys present for locale %s',
    (_locale, messages) => {
      expect(
        getAtPath(messages as Record<string, unknown>, [
          'shop',
          'cart',
          'checkout',
          'consent',
          'prefix',
        ])
      ).toBeTruthy();

      expect(
        getAtPath(messages as Record<string, unknown>, [
          'shop',
          'cart',
          'checkout',
          'consent',
          'required',
        ])
      ).toBeTruthy();
    }
  );

  it.each(cookieAlignmentCases)(
    'aligns cookie banner wording with privacy cookie wording for locale $locale',
    ({
      locale,
      messages,
      bannerRequired,
      bannerForbidden,
      privacyRequired,
    }) => {
      const banner = String(
        getAtPath(messages as Record<string, unknown>, [
          'CookieBanner',
          'description',
        ]) ?? ''
      );
      const privacy = String(
        getAtPath(messages as Record<string, unknown>, [
          'legal',
          'privacy',
          'cookies',
          'content',
        ]) ?? ''
      );

      for (const snippet of bannerRequired) {
        expect(
          banner,
          `locale=${locale} banner should contain "${snippet}"`
        ).toContain(snippet);
      }

      for (const snippet of bannerForbidden) {
        expect(
          banner,
          `locale=${locale} banner should not contain "${snippet}"`
        ).not.toContain(snippet);
      }

      for (const snippet of privacyRequired) {
        expect(
          privacy,
          `locale=${locale} privacy content should contain "${snippet}"`
        ).toContain(snippet);
      }
    }
  );
});
