import type React from 'react';
import { Toaster } from 'sonner';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import groq from 'groq';

import { locales } from '@/i18n/config';
import Footer from '@/components/shared/Footer';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { getCurrentUser } from '@/lib/auth';
import { client } from '@/client';

import { MainSwitcher } from '@/components/header/MainSwitcher';
import { AppChrome } from '@/components/header/AppChrome';

import { CookieBanner } from '@/components/shared/CookieBanner';
import { OnlineCounterPopup } from '@/components/shared/OnlineCounterPopup';

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
  const blogCategories: Array<{ _id: string; title: string }> = await client
    .withConfig({ useCdn: false })
    .fetch(
      groq`
        *[_type == "category"] | order(orderRank asc) {
          _id,
          title
        }
      `
    );

  const userExists = Boolean(user);
  const enableAdmin =
    (
      process.env.ENABLE_ADMIN_API ??
      process.env.NEXT_PUBLIC_ENABLE_ADMIN ??
      ''
    ).toLowerCase() === 'true';

  const isAdmin = user?.role === 'admin';
  const showAdminNavLink = Boolean(user) && isAdmin && enableAdmin;

  return (
    <NextIntlClientProvider messages={messages}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <AppChrome
          userExists={userExists}
          showAdminLink={showAdminNavLink}
          blogCategories={blogCategories}
        >
          <MainSwitcher
            userExists={userExists}
            showAdminLink={showAdminNavLink}
            blogCategories={blogCategories}
          >
            {children}
          </MainSwitcher>
        </AppChrome>
        <OnlineCounterPopup />

        <Footer />
        <Toaster position="top-right" richColors expand />
        <CookieBanner />
      </ThemeProvider>
    </NextIntlClientProvider>
  );
}
