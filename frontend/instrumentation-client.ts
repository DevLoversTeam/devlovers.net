import * as Sentry from '@sentry/nextjs';

const isProduction =
  process.env.NEXT_PUBLIC_VERCEL_ENV === 'production' ||
  process.env.NODE_ENV === 'production';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  enabled: isProduction,

  tracesSampleRate: 0.1,

  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,

  release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,

  sendDefaultPii: false,
});
