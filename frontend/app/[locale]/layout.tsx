import type React from 'react';
import { Toaster } from 'sonner';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { locales } from '@/i18n/config';
import Footer from '@/components/shared/Footer';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { getCurrentUser } from '@/lib/auth';

import { MainSwitcher } from '@/components/header/MainSwitcher';
import { AppChrome } from '@/components/header/AppChrome';

import { CookieBanner } from '@/components/shared/CookieBanner';

export const dynamic = 'force-dynamic';

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;

  if (!locales.includes(locale as any)) notFound();

  const messages = await getMessages({ locale });
  const user = await getCurrentUser();

  const userExists = Boolean(user);
  const showAdminNavLink = process.env.NEXT_PUBLIC_ENABLE_ADMIN === 'true';

  return (
    <NextIntlClientProvider messages={messages}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <AppChrome userExists={userExists} showAdminLink={showAdminNavLink}>
          <MainSwitcher>{children}</MainSwitcher>
        </AppChrome>

        <Footer />
        <Toaster position="top-right" richColors expand />
        <CookieBanner />
      </ThemeProvider>
    </NextIntlClientProvider>
  );
}
