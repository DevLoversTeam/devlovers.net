import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

type FileEntry = { abs: string; rel: string; text: string };

const REQUIRED_MONO_CODES = [
  'MONO_SIG_INVALID',
  'MONO_PUBKEY_REFRESHED',
  'MONO_DEDUP',
  'MONO_OLD_EVENT',
  'MONO_MISMATCH',
  'MONO_PAID_APPLIED',
  'MONO_REFUND_APPLIED',
  'MONO_STORE_MODE',
  'MONO_CREATE_INVOICE_FAILED',
  'MONO_EXPIRED_RECONCILED',
] as const;

function isIgnoredDir(name: string) {
  return (
    name === 'node_modules' ||
    name === '.next' ||
    name === '.git' ||
    name === 'dist' ||
    name === 'build' ||
    name === 'coverage' ||
    name === '.turbo'
  );
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const e of entries) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (isIgnoredDir(e.name)) continue;
      out.push(...(await walk(abs)));
      continue;
    }
    out.push(abs);
  }

  return out;
}

async function readText(abs: string): Promise<string | null> {
  const ext = path.extname(abs).toLowerCase();
  if (!['.ts', '.tsx', '.js', '.jsx'].includes(ext)) return null;

  try {
    return await fs.readFile(abs, 'utf8');
  } catch {
    return null;
  }
}

function toPosix(p: string) {
  return p.replaceAll(path.sep, '/');
}

function isProdCode(rel: string) {
  const r = toPosix(rel);
  if (r.includes('/lib/tests/')) return false;
  if (r.includes('.test.')) return false;
  if (r.includes('.spec.')) return false;
  return true;
}

function isMonobankRelated(rel: string, text: string) {
  const r = toPosix(rel).toLowerCase();
  if (r.includes('monobank')) return true;
  if (r.includes('/app/api/shop/checkout/route.ts')) return true;
  if (text.includes('MONO_')) return true;
  if (text.toLowerCase().includes('monobank')) return true;
  if (text.includes("provider: 'monobank'")) return true;
  if (text.includes("paymentProvider: 'monobank'")) return true;

  return false;
}

async function loadFrontendEntries(): Promise<FileEntry[]> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const frontendRoot = path.resolve(here, '../../..');

  const roots = [
    path.join(frontendRoot, 'app'),
    path.join(frontendRoot, 'lib'),
  ];

  const files: string[] = [];
  for (const r of roots) {
    try {
      files.push(...(await walk(r)));
    } catch {
      // ignore missing roots
    }
  }

  const entries: FileEntry[] = [];
  for (const abs of files) {
    const text = await readText(abs);
    if (text === null) continue;
    const rel = path.relative(frontendRoot, abs);
    entries.push({ abs, rel, text });
  }

  return entries;
}

describe('monobank logging safety (I1)', () => {
  it('required MONO_* codes exist in app/lib', async () => {
    const entries = await loadFrontendEntries();
    const hay = entries.map(e => e.text).join('\n');

    const missing = REQUIRED_MONO_CODES.filter(code => !hay.includes(code));
    expect(missing).toEqual([]);
  });

  it('no console.* in prod monobank-related code', async () => {
    const entries = await loadFrontendEntries();
    const offenders: Array<{ file: string; sample: string }> = [];

    for (const e of entries) {
      if (!isProdCode(e.rel)) continue;
      if (!isMonobankRelated(e.rel, e.text)) continue;

      const m = e.text.match(/console\.(log|info|warn|error|debug)\s*\(/);
      if (m) {
        const idx = e.text.indexOf(m[0]);
        const sample = e.text.slice(
          Math.max(0, idx - 80),
          Math.min(e.text.length, idx + 120)
        );
        offenders.push({ file: toPosix(e.rel), sample });
      }
    }

    expect(offenders).toEqual([]);
  });

  it('no obvious payload/PII/secret keys inside logging meta objects (prod monobank-related)', async () => {
    const entries = await loadFrontendEntries();
    const offenders: Array<{ file: string; match: string }> = [];

    const forbidden = [
      'body',
      'headers',
      'payload',
      'raw',
      'statusToken',
      'authorization',
      'cookie',
      'set-cookie',
      'email',
      'phone',
      'card',
      'pan',
      'cvv',
      'merchantPaymInfo',
      'basketOrder',
      'items',
    ];

    function hasForbiddenMetaKey(chunk: string): boolean {
      for (const key of forbidden) {
        const simpleIdent = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key);
        if (simpleIdent) {
          const rx = new RegExp(`(^|[,{]\\s*)${key}\\s*:`, 'i');
          if (rx.test(chunk)) return true;
        }
        const qrx = new RegExp(`(^|[,{]\\s*)(['"])${key}\\2\\s*:`, 'i');
        if (qrx.test(chunk)) return true;
      }
      return false;
    }
    const patterns: RegExp[] = [
      /(logInfo|logWarn)\(\s*['"`][^'"`]+['"`]\s*,\s*{[\s\S]*?}\s*\)/g,
      /logError\(\s*['"`][^'"`]+['"`]\s*,\s*[^,]+,\s*{[\s\S]*?}\s*\)/g,
      /monoLogWarn\(\s*[^,]+,\s*{[\s\S]*?}\s*\)/g,
      /monoLogError\(\s*[^,]+,\s*[^,]+,\s*{[\s\S]*?}\s*\)/g,
    ];

    for (const e of entries) {
      if (!isProdCode(e.rel)) continue;
      if (!isMonobankRelated(e.rel, e.text)) continue;

      for (const rx of patterns) {
        let m: RegExpExecArray | null;
        while ((m = rx.exec(e.text))) {
          const chunk = m[0];
          if (hasForbiddenMetaKey(chunk)) {
            offenders.push({
              file: toPosix(e.rel),
              match: chunk.slice(0, 240),
            });
            break;
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('if a monobank webhook reads raw body text(), it must contain sha256 hashing in the same file', async () => {
    const entries = await loadFrontendEntries();
    const offenders: Array<{ file: string }> = [];

    for (const e of entries) {
      if (!isProdCode(e.rel)) continue;

      const r = toPosix(e.rel).toLowerCase();
      const isWebhookish =
        r.includes('webhook') || e.text.toLowerCase().includes('webhook');
      if (!isWebhookish) continue;
      if (!isMonobankRelated(e.rel, e.text)) continue;

      const readsRaw = /\.\s*text\s*\(\s*\)/.test(e.text);
      if (!readsRaw) continue;

      const hasSha =
        /sha256/i.test(e.text) ||
        /createHash\(\s*['"]sha256['"]\s*\)/i.test(e.text);
      if (!hasSha) offenders.push({ file: toPosix(e.rel) });
    }

    expect(offenders).toEqual([]);
  });
});
