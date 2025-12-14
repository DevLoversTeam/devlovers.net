import { Toaster } from 'sonner';
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import Link from 'next/link';
import Footer from '@/components/shared/Footer';
import './globals.css';

import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { LogoutButton } from "@/components/auth/logoutButton";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Home | DevLovers",
  description:
    "DevLovers - a platform for technical interview preparation in frontend, backend, and full-stack development.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-50 text-gray-900 dark:bg-neutral-950 dark:text-gray-100 transition-colors duration-300`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
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

                {/* Auth actions */}
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
              </nav>
            </div>
          </header>

          <main className="mx-auto px-6 min-h-[80vh]">{children}</main>


          <Footer />

          <Toaster position="top-right" richColors expand />
        </ThemeProvider>
      </body>
    </html>
  );
}