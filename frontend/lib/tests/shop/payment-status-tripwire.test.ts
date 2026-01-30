import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Tripwire: fail if any code writes orders.paymentStatus via direct:
 *   - db.update(orders).set({ paymentStatus: ... })
 *   - db.insert(orders).values({ paymentStatus: ... })
 * outside an explicit allowlist.
 *
 * Scope: repo TS/TSX files (excluding node_modules/.next/dist/etc).
 * NOTE: This is NOT an AST parser. It is a scoped scan:
 *   - Finds `.set({ ... })` / `.values({ ... })`
 *   - Extracts ONLY the balanced object literal argument `{ ... }`
 *   - Detects `paymentStatus` only as a TOP-LEVEL key inside that object literal
 */

const REPO_ROOT = process.cwd();

const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  'coverage',
  '.turbo',
  '.vercel',
  'out',
]);

function norm(p: string): string {
  return p.replaceAll('\\', '/');
}

// Keep this allowlist very small on purpose.
// Rules are per-file and per-operation (insert(values) vs update(set)).
type AllowedWriters = { set: boolean; values: boolean };

const WRITER_RULES = new Map<string, AllowedWriters>([
  // Guarded writer (allowed): internal state machine transitions
  [norm('lib/services/orders/payment-state.ts'), { set: true, values: true }],

  // Allowed ONLY for initial order creation (insert). Updates must stay guarded.
  [norm('lib/services/orders/checkout.ts'), { set: false, values: true }],

  // If you ever intentionally allow route-level inserts, add explicitly:
  // [norm('app/api/shop/checkout/route.ts'), { set: false, values: true }],
]);

function getAllowed(rel: string): AllowedWriters {
  return WRITER_RULES.get(rel) ?? { set: false, values: false };
}

function walk(dirAbs: string, relBase: string, out: string[]) {
  for (const entry of fs.readdirSync(dirAbs, { withFileTypes: true })) {
    const abs = path.join(dirAbs, entry.name);
    const rel = norm(path.join(relBase, entry.name));

    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      walk(abs, rel, out);
      continue;
    }

    if (!entry.isFile()) continue;
    if (!rel.endsWith('.ts') && !rel.endsWith('.tsx')) continue;

    out.push(rel);
  }
}

type ExtractedObject = { text: string; endIndex: number };

/**
 * Extracts a balanced object literal starting at `braceStart` (which MUST point to '{').
 * Handles strings and comments to avoid premature brace matching.
 */
function extractBalancedObjectLiteral(
  src: string,
  braceStart: number
): ExtractedObject | null {
  if (braceStart < 0 || braceStart >= src.length) return null;
  if (src[braceStart] !== '{') return null;

  type Mode = 'code' | 'single' | 'double' | 'template' | 'line' | 'block';
  const stack: Mode[] = ['code'];
  const mode = () => stack[stack.length - 1];

  let depth = 0;

  // For `${ ... }` inside template strings
  const templateExprDepth: number[] = [];

  for (let i = braceStart; i < src.length; i++) {
    const ch = src[i];
    const next = i + 1 < src.length ? src[i + 1] : '';

    // --- comment/string handling ---
    if (mode() === 'line') {
      if (ch === '\n') stack.pop();
      continue;
    }
    if (mode() === 'block') {
      if (ch === '*' && next === '/') {
        stack.pop();
        i++;
      }
      continue;
    }
    if (mode() === 'single') {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === "'") stack.pop();
      continue;
    }
    if (mode() === 'double') {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === '"') stack.pop();
      continue;
    }
    if (mode() === 'template') {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === '`') {
        stack.pop();
        continue;
      }
      // Enter template expr `${`
      if (ch === '$' && next === '{') {
        depth++;
        templateExprDepth.push(1);
        stack.push('code');
        i++; // skip '{'
        continue;
      }
      continue;
    }

    // --- code mode ---
    if (ch === '/' && next === '/') {
      stack.push('line');
      i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      stack.push('block');
      i++;
      continue;
    }
    if (ch === "'") {
      stack.push('single');
      continue;
    }
    if (ch === '"') {
      stack.push('double');
      continue;
    }
    if (ch === '`') {
      stack.push('template');
      continue;
    }

    // --- braces ---
    if (ch === '{') {
      depth++;
      if (templateExprDepth.length > 0) {
        templateExprDepth[templateExprDepth.length - 1]++;
      }
      continue;
    }
    if (ch === '}') {
      depth--;
      if (templateExprDepth.length > 0) {
        templateExprDepth[templateExprDepth.length - 1]--;
        if (templateExprDepth[templateExprDepth.length - 1] === 0) {
          templateExprDepth.pop();
          // return to template mode (we entered code because of `${ ... }`)
          if (stack.length >= 2 && stack[stack.length - 2] === 'template') {
            stack.pop(); // pop 'code'
          }
        }
      }
      if (depth === 0) {
        return { text: src.slice(braceStart, i + 1), endIndex: i + 1 };
      }
      continue;
    }
  }

  return null;
}

/**
 * Returns true if the extracted `{ ... }` contains a TOP-LEVEL key `paymentStatus`
 * (identifier, quoted, shorthand, or computed string literal).
 */
function hasTopLevelPaymentStatusKey(objectLiteralWithBraces: string): boolean {
  if (
    objectLiteralWithBraces.length < 2 ||
    objectLiteralWithBraces[0] !== '{' ||
    objectLiteralWithBraces[objectLiteralWithBraces.length - 1] !== '}'
  ) {
    return false;
  }

  const body = objectLiteralWithBraces.slice(1, -1);

  type Mode = 'code' | 'single' | 'double' | 'template' | 'line' | 'block';
  const stack: Mode[] = ['code'];
  const mode = () => stack[stack.length - 1];

  // nesting inside the object literal body (nested { [ ( )
  let nest = 0;

  const isIdentStart = (c: string) => /[A-Za-z_$]/.test(c);
  const isIdentPart = (c: string) => /[A-Za-z0-9_$]/.test(c);

  const skipWs = (s: string, idx: number) => {
    while (idx < s.length && /\s/.test(s[idx])) idx++;
    return idx;
  };

  const readQuoted = (s: string, start: number) => {
    const quote = s[start];
    let j = start + 1;
    let value = '';
    for (; j < s.length; j++) {
      const c = s[j];
      if (c === '\\') {
        j++;
        if (j < s.length) value += s[j];
        continue;
      }
      if (c === quote) break;
      value += c;
    }
    if (j >= s.length || s[j] !== quote) return null;
    return { value, end: j + 1 };
  };

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    const next = i + 1 < body.length ? body[i + 1] : '';

    // --- comment/string handling ---
    if (mode() === 'line') {
      if (ch === '\n') stack.pop();
      continue;
    }
    if (mode() === 'block') {
      if (ch === '*' && next === '/') {
        stack.pop();
        i++;
      }
      continue;
    }
    if (mode() === 'single') {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === "'") stack.pop();
      continue;
    }
    if (mode() === 'double') {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === '"') stack.pop();
      continue;
    }
    if (mode() === 'template') {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === '`') {
        stack.pop();
        continue;
      }
      continue;
    }

    // --- code mode ---
    if (ch === '/' && next === '/') {
      stack.push('line');
      i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      stack.push('block');
      i++;
      continue;
    }
    if (ch === "'") {
      stack.push('single');
      continue;
    }
    if (ch === '"') {
      stack.push('double');
      continue;
    }
    if (ch === '`') {
      stack.push('template');
      continue;
    }

    // nesting
    if (ch === '{' || ch === '[' || ch === '(') {
      nest++;
      continue;
    }
    if (ch === '}' || ch === ']' || ch === ')') {
      if (nest > 0) nest--;
      continue;
    }

    // only top-level keys
    if (nest !== 0) continue;

    if (ch === ',' || /\s/.test(ch)) continue;

    // identifier key: paymentStatus: ... OR shorthand: paymentStatus,
    if (isIdentStart(ch)) {
      let j = i + 1;
      while (j < body.length && isIdentPart(body[j])) j++;
      const ident = body.slice(i, j);

      if (ident === 'paymentStatus') {
        j = skipWs(body, j);
        const after = j < body.length ? body[j] : '';
        if (after === ':' || after === ',' || after === '') return true;
      }

      i = j - 1;
      continue;
    }

    // quoted key: 'paymentStatus': or "paymentStatus":
    if (ch === "'" || ch === '"') {
      const q = readQuoted(body, i);
      if (q) {
        const key = q.value;
        const k = skipWs(body, q.end);
        if (key === 'paymentStatus' && k < body.length && body[k] === ':') {
          return true;
        }
        i = q.end - 1;
      }
      continue;
    }

    // computed key: ['paymentStatus']:
    if (ch === '[') {
      let j = skipWs(body, i + 1);
      const qch = body[j];
      if (qch === "'" || qch === '"') {
        const q = readQuoted(body, j);
        if (q) {
          const key = q.value;
          j = skipWs(body, q.end);
          if (j < body.length && body[j] === ']') {
            j = skipWs(body, j + 1);
            if (key === 'paymentStatus' && j < body.length && body[j] === ':') {
              return true;
            }
          }
          i = Math.max(i, q.end - 1);
        }
      }
      continue;
    }
  }

  return false;
}

function hasDirectOrdersWriter(
  source: string,
  allowed: AllowedWriters
): boolean {
  const LOOKBACK = 2000;

  const isOrdersUpdateContext = (src: string, callIndex: number) => {
    const start = Math.max(0, callIndex - LOOKBACK);
    const chunk = src.slice(start, callIndex);
    return /\bupdate\s*\(\s*orders\s*\)/m.test(chunk);
  };

  const isOrdersInsertContext = (src: string, callIndex: number) => {
    const start = Math.max(0, callIndex - LOOKBACK);
    const chunk = src.slice(start, callIndex);
    return /\binsert\s*\(\s*orders\s*\)/m.test(chunk);
  };

  // Scan `.set({ ... })` / `.values({ ... })` call sites, then inspect ONLY their object literal argument.
  const CALL_RE = /\.(set|values)\s*\(\s*{/g;

  let m: RegExpExecArray | null;
  while ((m = CALL_RE.exec(source)) !== null) {
    const callKind = m[1] as 'set' | 'values';

    // Only enforce for orders table chains:
    // - db.update(orders).set({ ... })
    // - db.insert(orders).values({ ... })
    if (callKind === 'set' && !isOrdersUpdateContext(source, m.index)) continue;
    if (callKind === 'values' && !isOrdersInsertContext(source, m.index))
      continue;

    // `m[0]` ends with `{` due to the regex
    const braceStart = m.index + (m[0].length - 1);
    const extracted = extractBalancedObjectLiteral(source, braceStart);
    if (!extracted) continue;

    // If this operation is explicitly allowed for this file, ignore it
    if (callKind === 'set' && allowed.set) {
      CALL_RE.lastIndex = Math.max(CALL_RE.lastIndex, extracted.endIndex);
      continue;
    }
    if (callKind === 'values' && allowed.values) {
      CALL_RE.lastIndex = Math.max(CALL_RE.lastIndex, extracted.endIndex);
      continue;
    }

    if (hasTopLevelPaymentStatusKey(extracted.text)) return true;

    // jump forward to end of this object to avoid rescanning inside it
    CALL_RE.lastIndex = Math.max(CALL_RE.lastIndex, extracted.endIndex);
  }

  return false;
}

describe('Task 6: Tripwire — no direct orders.paymentStatus writers outside allowlist', () => {
  it('fails if any file writes orders.paymentStatus via direct .set/.values outside allowlist', () => {
    const files: string[] = [];
    walk(REPO_ROOT, '', files);

    const offenders: string[] = [];

    for (const rel of files) {
      // Skip tests entirely (they contain regex/fixtures that look like writers)
      if (rel.startsWith('lib/tests/')) continue;
      if (rel.endsWith('.test.ts') || rel.endsWith('.test.tsx')) continue;
      if (rel.endsWith('.spec.ts') || rel.endsWith('.spec.tsx')) continue;

      const abs = path.join(REPO_ROOT, rel);
      const src = fs.readFileSync(abs, 'utf8');

      const allowed = getAllowed(rel);
      if (hasDirectOrdersWriter(src, allowed)) offenders.push(rel);
    }

    expect(offenders).toEqual([]);
  });
});
