import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-50 text-gray-900`}
      >
        <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
          <div className="max-w-5xl mx-auto flex items-center justify-between px-6 py-4">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-xl font-bold text-blue-600">DevLovers</span>
            </Link>
            <nav className="flex items-center gap-6 text-gray-700 font-medium">
              <Link href="/" className="hover:text-blue-600 transition">
                Home
              </Link>
              <Link href="/post" className="hover:text-blue-600 transition">
                Blog
              </Link>
               <Link href="/quiz/react-fundamentals" className="hover:text-blue-600 transition">
                  Quiz
                </Link>
              <Link href="/about" className="hover:text-blue-600 transition">
                About
              </Link>
              <Link href="/contacts" className="hover:text-blue-600 transition">
                Contacts
              </Link>
            </nav>
          </div>
        </header>
        <main className="max-w-5xl mx-auto px-6 py-10">{children}</main>
        <footer className="border-t border-gray-200 text-center py-6 text-sm text-gray-500">
          © {new Date().getFullYear()} DevLovers Blog. All rights reserved.
        </footer>
      </body>
    </html>
  );
}
