// scripts/shop-janitor-restock-stale.mjs
// Calls internal janitor endpoint on a schedule (GitHub Actions).
// Safe defaults: sends "{}" body to avoid NextRequest.json() throwing.

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

const timeoutMs = Number(process.env.JANITOR_TIMEOUT_MS ?? '25000');

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeoutMs);

try {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      // Send both variants to match whatever your route expects.
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

  // Treat RATE_LIMITED as success for schedulers (no-op, expected sometimes).
  if (res.status === 429) process.exit(0);
  if (!res.ok) process.exit(1);
} catch (err) {
  console.error('[janitor] request failed', err?.message ?? err);
  process.exit(1);
} finally {
  clearTimeout(timer);
}
