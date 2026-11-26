// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { FeaturesSection } from '@/components/about/FeaturesSection';
import en from '@/messages/en.json';
import pl from '@/messages/pl.json';
import uk from '@/messages/uk.json';

vi.mock('@/i18n/routing', () => ({
  Link: (props: ComponentProps<'a'>) => <a {...props} />,
}));

describe('feature tab translations', () => {
  it.each([
    { locale: 'en', messages: en },
    { locale: 'uk', messages: uk },
    { locale: 'pl', messages: pl },
  ])(
    'renders shared and page-specific names in $locale',
    ({ locale, messages }) => {
      const { about, navigation } = messages;
      render(
        <NextIntlClientProvider
          locale={locale}
          messages={{ about, navigation }}
          timeZone="UTC"
          onError={error => {
            throw error;
          }}
        >
          <FeaturesSection />
        </NextIntlClientProvider>
      );

      const titles = [
        about.features.qa.title,
        navigation.quizzes,
        navigation.leaderboard,
        about.features.profile.title,
        about.features.blog.title,
        navigation.shop,
      ];

      expect(screen.getAllByRole('tab')).toHaveLength(titles.length);
      for (const name of titles) {
        expect(screen.getByRole('tab', { name })).toBeInTheDocument();
      }
    }
  );
});
