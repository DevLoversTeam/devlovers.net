import './globals.css';

import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './globals.css';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://devlovers.net';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'DevLovers — Technical Interview Platform',
  description:
    'DevLovers is a modern platform for developers to prepare for technical interviews: Q&A, quizzes, leaderboards, AI explanations, and multi-language support.',
  openGraph: {
    title: 'DevLovers — Technical Interview Platform',
    description:
      'Prepare for technical interviews with Q&A, quizzes, leaderboards, and AI-powered explanations.',
    url: siteUrl,
    siteName: 'DevLovers',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'DevLovers — Technical Interview Platform',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DevLovers — Technical Interview Platform',
    description: 'Modern interview preparation platform for developers.',
    images: ['/og.png'],
  },
  icons: {
    icon: [
      {
        media: '(prefers-color-scheme: light)',
        url: '/favicon-light.svg',
      },
      {
        media: '(prefers-color-scheme: dark)',
        url: '/favicon-dark.svg',
      },
    ],
  },
};

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="uk" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('theme') || 'system';
                  if (theme === 'system') {
                    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                  }
                  if (theme === 'dark') {
                    document.documentElement.classList.add('dark');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} bg-gray-50 text-gray-900 antialiased transition-colors duration-300 dark:bg-neutral-950 dark:text-gray-100`}
      >
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
