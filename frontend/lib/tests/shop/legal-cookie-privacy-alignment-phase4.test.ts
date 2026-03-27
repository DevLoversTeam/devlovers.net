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

describe('legal cookie/privacy alignment phase 4', () => {
  it('keeps checkout consent keys present for all supported locales', () => {
    for (const messages of [en, uk, pl]) {
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
  });

  it('aligns cookie banner wording with privacy cookie wording in all supported locales', () => {
    const cases = [
      {
        messages: en,
        bannerRequired: [
          'cookies and local storage',
          'signed in',
          'preferences',
        ],
        bannerForbidden: ['personalized content', 'analyze our traffic'],
        privacyRequired: ['cookies/local storage', 'signed in', 'preferences'],
      },
      {
        messages: uk,
        bannerRequired: [
          'cookie та локальне сховище',
          'авторизації',
          'налаштувань',
        ],
        bannerForbidden: ['персоналізації контенту', 'аналізу трафіку'],
        privacyRequired: [
          'cookie/локальне сховище',
          'авторизації',
          'налаштувань',
        ],
      },
      {
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

    for (const item of cases) {
      const banner = String(
        getAtPath(item.messages as Record<string, unknown>, [
          'CookieBanner',
          'description',
        ]) ?? ''
      );
      const privacy = String(
        getAtPath(item.messages as Record<string, unknown>, [
          'legal',
          'privacy',
          'cookies',
          'content',
        ]) ?? ''
      );

      for (const snippet of item.bannerRequired) {
        expect(banner).toContain(snippet);
      }

      for (const snippet of item.bannerForbidden) {
        expect(banner).not.toContain(snippet);
      }

      for (const snippet of item.privacyRequired) {
        expect(privacy).toContain(snippet);
      }
    }
  });
});
