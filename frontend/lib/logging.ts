export function logError(context: string, error: unknown) {
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd) {
    if (error instanceof Error) {
      console.error(context, { message: error.message });
    } else {
      console.error(context);
    }
    return;
  }

  console.error(context, error);
}

export function logWarn(message: string, meta?: Record<string, unknown>) {
  if (meta) console.info(`WARN: ${message}`, meta);
  else console.info(`WARN: ${message}`);
}
