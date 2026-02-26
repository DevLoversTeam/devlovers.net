import groq from 'groq';
import { unstable_cache } from 'next/cache';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type React from 'react';
import { Toaster } from 'sonner';

import { client } from '@/client';
import { AppChrome } from '@/components/header/AppChrome';
import { MainSwitcher } from '@/components/header/MainSwitcher';
import { CookieBanner } from '@/components/shared/CookieBanner';
import Footer from '@/components/shared/Footer';
import { ScrollWatcher } from '@/components/shared/ScrollWatcher';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { locales } from '@/i18n/config';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const getCachedBlogCategories = unstable_cache(
  async () =>
    client.fetch<Array<{ _id: string; title: string }>>(groq`
      *[_type == "category"] | order(orderRank asc) {
        _id,
        title
      }
    `),
  ['blog-categories'],
  { revalidate: 3600, tags: ['blog-categories'] }
);

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
  const blogCategories = await getCachedBlogCategories();

  const userExists = Boolean(user);
  const enableAdmin =
    (
      process.env.ENABLE_ADMIN_API ??
      process.env.NEXT_PUBLIC_ENABLE_ADMIN ??
      ''
    ).toLowerCase() === 'true';

  const isAdmin = user?.role === 'admin';
  const showAdminNavLink = Boolean(user) && isAdmin && enableAdmin;
  const userId = user?.id ?? null;

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
          userId={userId}
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

        <Footer />
        <Toaster position="top-right" richColors expand />
        <CookieBanner />
        <ScrollWatcher />
      </ThemeProvider>
    </NextIntlClientProvider>
  );
}
