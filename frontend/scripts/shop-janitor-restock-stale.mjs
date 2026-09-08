import https from 'node:https';

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
  // Node fetch adds Sec-Fetch-Mode, which the non-browser guard rejects.
  // Native requests also avoid forwarding the secret through redirects.
  const target = new URL(url);
  if (target.protocol !== 'https:') {
    throw new Error('JANITOR_URL must use HTTPS');
  }
  const { status, text } = await new Promise((resolve, reject) => {
    const req = https.request(target, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength('{}'),
        'x-internal-janitor-secret': secret,
        authorization: `Bearer ${secret}`,
      },
      signal: controller.signal,
    }, res => {
      res.setEncoding('utf8');
      let text = '';
      res.on('data', chunk => { text += chunk; });
      res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode, text }));
    });
    req.on('error', reject);
    req.end('{}');
  });

  console.log(`[janitor] status=${status}`);
  if (text) console.log(text);

  if (status !== 429 && !(status >= 200 && status < 300)) {
    process.exitCode = 1;
  }
} catch (err) {
  console.error('[janitor] request failed', err?.message ?? err);
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
}
