type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveLogLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL?.trim().toLowerCase() ??
    (process.env.NODE_ENV === 'production' ? 'info' : 'debug')) as LogLevel;

  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error')
    return raw;
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

const CURRENT_LEVEL = resolveLogLevel();
const IS_PROD = process.env.NODE_ENV === 'production';

function shouldLog(level: LogLevel) {
  return LEVEL_WEIGHT[level] >= LEVEL_WEIGHT[CURRENT_LEVEL];
}

function toErrorShape(
  error: unknown
): { name?: string; message: string; stack?: string } | null {
  if (!error) return null;

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(IS_PROD ? null : { stack: error.stack }),
    };
  }

  if (typeof error === 'string') return { message: error };

  try {
    return { message: JSON.stringify(error) };
  } catch {
    return { message: String(error) };
  }
}

function redactJsonStringify(value: unknown): string {
  const SENSITIVE_KEY_RE =
    /(secret|token|password|authorization|cookie|api[_-]?key)/i;

  return JSON.stringify(value, (key, val) => {
    if (typeof key === 'string' && SENSITIVE_KEY_RE.test(key))
      return '[REDACTED]';
    return val;
  });
}

function emit(
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>,
  error?: unknown
) {
  if (!shouldLog(level)) return;

  const payload: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...(meta ? { meta } : null),
    ...(error ? { err: toErrorShape(error) } : null),
  };

  const line = redactJsonStringify(payload);

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export function logError(
  context: string,
  error: unknown,
  meta?: Record<string, unknown>
) {
  emit('error', context, meta, error);
}

export function logWarn(message: string, meta?: Record<string, unknown>) {
  emit('warn', message, meta);
}

export function logInfo(message: string, meta?: Record<string, unknown>) {
  emit('info', message, meta);
}

export function logDebug(message: string, meta?: Record<string, unknown>) {
  emit('debug', message, meta);
}
