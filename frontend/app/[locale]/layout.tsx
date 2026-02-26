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
import { AuthProvider } from '@/hooks/useAuth';
import { locales } from '@/i18n/config';

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

  const [messages, blogCategories] = await Promise.all([
    getMessages({ locale }),
    getCachedBlogCategories(),
  ]);

  const enableAdmin =
    (
      process.env.ENABLE_ADMIN_API ??
      process.env.NEXT_PUBLIC_ENABLE_ADMIN ??
      ''
    ).toLowerCase() === 'true';

  return (
    <NextIntlClientProvider messages={messages}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <AuthProvider>
          <AppChrome
            enableAdminFeature={enableAdmin}
            blogCategories={blogCategories}
          >
            <MainSwitcher
              enableAdminFeature={enableAdmin}
              blogCategories={blogCategories}
            >
              {children}
            </MainSwitcher>
          </AppChrome>
        </AuthProvider>

        <Footer />
        <Toaster position="top-right" richColors expand />
        <CookieBanner />
        <ScrollWatcher />
      </ThemeProvider>
    </NextIntlClientProvider>
  );
}
