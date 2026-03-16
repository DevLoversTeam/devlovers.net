import * as Sentry from '@sentry/nextjs';

const isProduction =
  process.env.VERCEL_ENV === 'production' ||
  process.env.NEXT_PUBLIC_VERCEL_ENV === 'production' ||
  process.env.NODE_ENV === 'production';

export async function register() {
  if (!isProduction) return;

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError: typeof Sentry.captureRequestError = (...args) => {
  if (!isProduction) return;
  try {
    return Sentry.captureRequestError(...args);
  } catch {
    // Never let telemetry plumbing create unhandled request errors.
    return;
  }
};
