import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { test } from 'node:test';

const script = new URL('./shop-janitor-restock-stale.mjs', import.meta.url);

async function run(t, handler, timeout = '2000') {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const child = spawn(process.execPath, [script.pathname], {
    env: {
      ...process.env,
      JANITOR_URL: `http://127.0.0.1:${server.address().port}/janitor`,
      INTERNAL_JANITOR_SECRET: 'test-only-secret',
      JANITOR_TIMEOUT_MS: timeout,
    },
  });
  let output = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  const code = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
  return { code, output };
}

test('sends authenticated non-browser POST accepted by the origin guard', async t => {
  let received;
  const result = await run(t, (req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      received = { method: req.method, headers: req.headers, body };
      const blocked = Object.keys(req.headers).some(key =>
        key === 'origin' || key === 'referer' || key.startsWith('sec-fetch-'));
      res.writeHead(blocked ? 403 : 200).end('{}');
    });
  });
  assert.equal(result.code, 0, result.output);
  assert.equal(received.method, 'POST');
  assert.equal(received.body, '{}');
  assert.equal(received.headers['x-internal-janitor-secret'], 'test-only-secret');
  assert.equal(received.headers.authorization, 'Bearer test-only-secret');
  assert.equal(received.headers['sec-fetch-mode'], undefined);
});

for (const [status, expected] of [[429, 0], [403, 1], [500, 1]]) {
  test(`handles HTTP ${status}`, async t => {
    const result = await run(t, (_req, res) => res.writeHead(status).end('{}'));
    assert.equal(result.code, expected, result.output);
  });
}

test('does not follow redirects or forward credentials', async t => {
  let requests = 0;
  const result = await run(t, (_req, res) => {
    requests++;
    res.writeHead(302, { location: '/other' }).end();
  });
  assert.equal(result.code, 1, result.output);
  assert.equal(requests, 1);
});

test('aborts when the server does not finish its response', async t => {
  const result = await run(t, (_req, res) => {
    res.writeHead(200);
    res.write('partial');
  }, '1000');
  assert.equal(result.code, 1, result.output);
  assert.match(result.output, /request failed/);
});
