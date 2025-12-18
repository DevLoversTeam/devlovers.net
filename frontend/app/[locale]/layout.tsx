import { Toaster } from 'sonner';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { locales } from '@/i18n/config';
import { Link } from '@/i18n/routing';
import Footer from '@/components/shared/Footer';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { LogoutButton } from '@/components/auth/logoutButton';
import { getCurrentUser } from '@/lib/auth';
import LanguageSwitcher from '@/components/shared/LanguageSwitcher';
import { headers } from 'next/headers';
import { Header as ShopHeader } from '@/components/shop/shop-header';

export const dynamic = 'force-dynamic';

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;

  if (!locales.includes(locale as any)) {
    notFound();
  }

  const messages = await getMessages();
  const user = await getCurrentUser();
  const scope = (await headers()).get('x-app-scope') ?? 'site';
  const showAdminNavLink = process.env.NEXT_PUBLIC_ENABLE_ADMIN === 'true';

  return (
    <NextIntlClientProvider messages={messages}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        {scope === 'shop' ? (
          <ShopHeader showAdminLink={showAdminNavLink} />
        ) : (
          <header className="bg-white dark:bg-neutral-900 border-b border-gray-200 dark:border-neutral-800 shadow-sm sticky top-0 z-50 transition-colors">
            <div className="max-w-5xl mx-auto flex items-center justify-between px-6 py-4">
              <Link href="/" className="flex items-center gap-2">
                <span className="text-xl font-bold text-blue-600 dark:text-blue-500">
                  DevLovers
                </span>
              </Link>

              <nav className="flex items-center gap-6 text-gray-700 dark:text-gray-300 font-medium">
                <Link
                  href="/q&a"
                  className="hover:text-blue-600 dark:hover:text-blue-400 transition"
                >
                  Q&A
                </Link>
                <Link
                  href="/quiz/react-fundamentals"
                  className="hover:text-blue-600 dark:hover:text-blue-400 transition"
                >
                  Quiz
                </Link>
                <Link
                  href="/leaderboard"
                  className="hover:text-blue-600 dark:hover:text-blue-400 transition"
                >
                  Leaderboard
                </Link>
                <Link
                  href="/blog"
                  className="hover:text-blue-600 dark:hover:text-blue-400 transition"
                >
                  Blog
                </Link>
                <Link
                  href="/about"
                  className="hover:text-blue-600 dark:hover:text-blue-400 transition"
                >
                  About
                </Link>
                <Link
                  href="/contacts"
                  className="hover:text-blue-600 dark:hover:text-blue-400 transition"
                >
                  Contacts
                </Link>
                <Link
                  href="/shop"
                  className="hover:text-blue-600 dark:hover:text-blue-400 transition"
                >
                  Shop
                </Link>

                {!user ? (
                  <Link
                    href="/login"
                    className="hover:text-blue-600 dark:hover:text-blue-400 transition"
                  >
                    Log in
                  </Link>
                ) : (
                  <LogoutButton />
                )}

                <LanguageSwitcher />
              </nav>
            </div>
          </header>
        )}

        <main className="mx-auto px-6 min-h-[80vh]">{children}</main>

        <Footer />

        <Toaster position="top-right" richColors expand />
      </ThemeProvider>
    </NextIntlClientProvider>
  );
}
