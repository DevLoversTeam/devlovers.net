import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

const script = new URL('./shop-janitor-restock-stale.mjs', import.meta.url);

// Generate an ephemeral localhost certificate; keep TLS verification enabled.
const fixtureDir = mkdtempSync(join(tmpdir(), 'janitor-tls-'));
after(() => rmSync(fixtureDir, { recursive: true, force: true }));
const keyPath = join(fixtureDir, 'key.pem');
const certPath = join(fixtureDir, 'cert.pem');
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
  '-keyout', keyPath, '-out', certPath, '-days', '1', '-subj', '/CN=localhost',
  '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' });
const tls = { key: readFileSync(keyPath), cert: readFileSync(certPath) };

async function run(t, handler, timeout = '2000', protocol = 'https', trust = true) {
  const server = protocol === 'https'
    ? https.createServer(tls, handler)
    : http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const child = spawn(process.execPath, [script.pathname], {
    env: {
      ...process.env,
      NODE_EXTRA_CA_CERTS: trust ? certPath : '',
      NODE_TLS_REJECT_UNAUTHORIZED: '1',
      JANITOR_URL: `${protocol}://127.0.0.1:${server.address().port}/janitor`,
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

test('rejects HTTP before sending credentials', async t => {
  let requests = 0;
  const result = await run(t, (_req, res) => {
    requests++;
    res.end('{}');
  }, '2000', 'http');
  assert.equal(result.code, 1, result.output);
  assert.match(result.output, /JANITOR_URL must use HTTPS/);
  assert.equal(requests, 0);
});

test('rejects an untrusted TLS certificate before sending credentials', async t => {
  let requests = 0;
  const result = await run(t, (_req, res) => {
    requests++;
    res.end('{}');
  }, '2000', 'https', false);
  assert.equal(result.code, 1, result.output);
  assert.match(result.output, /certificate/i);
  assert.equal(requests, 0);
});
