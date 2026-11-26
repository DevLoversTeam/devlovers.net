// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { LoginForm } from '@/components/auth/LoginForm';
import { SignupForm } from '@/components/auth/SignupForm';
import en from '@/messages/en.json';
import pl from '@/messages/pl.json';
import uk from '@/messages/uk.json';

vi.mock('@/i18n/routing', () => ({
  Link: (props: ComponentProps<'a'>) => <a {...props} />,
}));

describe('auth action labels', () => {
  it.each([
    { locale: 'en', messages: en },
    { locale: 'uk', messages: uk },
    { locale: 'pl', messages: pl },
  ])('uses the shared navigation labels in $locale', ({ locale, messages }) => {
    const { auth, navigation } = messages;
    const { rerender } = render(
      <NextIntlClientProvider
        locale={locale}
        messages={messages}
        timeZone="UTC"
      >
        <LoginForm
          locale={locale}
          returnTo="/dashboard"
          lastLoginMethod={null}
        />
      </NextIntlClientProvider>
    );

    expect(
      screen.getByRole('heading', { name: navigation.login })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: navigation.login })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: navigation.signup })
    ).toHaveAttribute('href', '/signup?returnTo=%2Fdashboard');

    rerender(
      <NextIntlClientProvider
        locale={locale}
        messages={messages}
        timeZone="UTC"
      >
        <SignupForm locale={locale} returnTo="/dashboard" />
      </NextIntlClientProvider>
    );

    expect(
      screen.getByRole('heading', { name: auth.signup.title })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: navigation.signup })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: navigation.login })
    ).toHaveAttribute('href', '/login?returnTo=%2Fdashboard');
  });
});
