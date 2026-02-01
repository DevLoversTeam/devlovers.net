const url = process.env.JANITOR_URL;
const secret = process.env.INTERNAL_JANITOR_SECRET;

if (!url) {
  console.error('[janitor] Missing JANITOR_URL');
  process.exit(1);
}
if (!secret) {
  console.error('[janitor] Missing INTERNAL_JANITOR_SECRET');
  process.exit(1);
}

const DEFAULT_TIMEOUT_MS = 25_000;
const MIN_TIMEOUT_MS = 1_000;

const rawTimeout = (process.env.JANITOR_TIMEOUT_MS ?? '').trim();

let timeoutMs = DEFAULT_TIMEOUT_MS;

if (rawTimeout) {
  if (/^\d+$/.test(rawTimeout)) {
    const n = Number(rawTimeout);
    if (Number.isSafeInteger(n) && n > 0) {
      timeoutMs = Math.max(MIN_TIMEOUT_MS, n);
    } else {
      console.warn(
        '[janitor] Invalid JANITOR_TIMEOUT_MS (non-positive/out of range). Using default.',
        {
          raw: rawTimeout,
        }
      );
    }
  } else {
    console.warn(
      '[janitor] Invalid JANITOR_TIMEOUT_MS (must be digits). Using default.',
      {
        raw: rawTimeout,
      }
    );
  }
}

console.log('[janitor] timeoutMs=', timeoutMs, 'raw=', rawTimeout || '(empty)');

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeoutMs);

try {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-internal-janitor-secret': secret,
      authorization: `Bearer ${secret}`,
    },
    body: '{}',
    signal: controller.signal,
  });

  const text = await res.text();
  console.log(`[janitor] status=${res.status}`);
  if (text) console.log(text);

  if (res.status === 429) process.exit(0);
  if (!res.ok) process.exit(1);
} catch (err) {
  console.error('[janitor] request failed', err?.message ?? err);
  process.exit(1);
} finally {
  clearTimeout(timer);
}
