import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { vi } from 'vitest';
import { NextRequest } from 'next/server';

const BASE_URL = 'http://localhost';

// Valid UUIDs for dynamic routes; format matters more than real existence.
const TEST_PRODUCT_ID = '00000000-0000-4000-8000-000000000001';
const TEST_ORDER_ID = '00000000-0000-4000-8000-000000000002';

const MUTATION_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;

type RouteCase =
  | {
      name: string;
      importPath: string;
      path: string;
      kind: 'static';
    }
  | {
      name: string;
      importPath: string;
      path: (id: string) => string;
      kind: 'dynamic-id';
      id: string;
    };

const cases: RouteCase[] = [
  {
    name: 'admin/products',
    importPath: '@/app/api/shop/admin/products/route',
    path: '/api/shop/admin/products',
    kind: 'static',
  },
  {
    name: 'admin/products/[id]',
    importPath: '@/app/api/shop/admin/products/[id]/route',
    path: (id: string) => `/api/shop/admin/products/${id}`,
    kind: 'dynamic-id',
    id: TEST_PRODUCT_ID,
  },
  {
    name: 'admin/products/[id]/status',
    importPath: '@/app/api/shop/admin/products/[id]/status/route',
    path: (id: string) => `/api/shop/admin/products/${id}/status`,
    kind: 'dynamic-id',
    id: TEST_PRODUCT_ID,
  },
  {
    name: 'admin/orders',
    importPath: '@/app/api/shop/admin/orders/route',
    path: '/api/shop/admin/orders',
    kind: 'static',
  },
  {
    name: 'admin/orders/[id]',
    importPath: '@/app/api/shop/admin/orders/[id]/route',
    path: (id: string) => `/api/shop/admin/orders/${id}`,
    kind: 'dynamic-id',
    id: TEST_ORDER_ID,
  },
  {
    name: 'admin/orders/[id]/refund',
    importPath: '@/app/api/shop/admin/orders/[id]/refund/route',
    path: (id: string) => `/api/shop/admin/orders/${id}/refund`,
    kind: 'dynamic-id',
    id: TEST_ORDER_ID,
  },
  {
    name: 'admin/orders/reconcile-stale',
    importPath: '@/app/api/shop/admin/orders/reconcile-stale/route',
    path: '/api/shop/admin/orders/reconcile-stale',
    kind: 'static',
  },
];

function makeReq(path: string, method: string) {
  const url = `${BASE_URL}${path}`;
  const origin = process.env.APP_ORIGIN ?? 'http://localhost:3000';

  // Intentionally invalid JSON payload to ensure kill-switch guard runs
  // BEFORE any req.json()/formData() parsing.
  const init: RequestInit = {
    method,
    headers: { 'content-type': 'application/json', origin },
  };

  if (method !== 'GET' && method !== 'HEAD') {
    // Using invalid JSON lets us detect incorrect handler ordering.
    (init as any).body = '{';
  }

  return new NextRequest(url, init as any);
}

async function readCodeFromResponse(
  res: Response
): Promise<{ status: number; code?: string; raw: string }> {
  const status = res.status;

  // Read body ONCE to avoid "body used already"
  const raw = await res.text();

  if (!raw) return { status, raw: '' };

  try {
    const parsed = JSON.parse(raw);
    const code =
      (parsed?.code as string | undefined) ??
      (parsed?.error?.code as string | undefined);

    return { status, code, raw };
  } catch {
    return { status, raw };
  }
}

async function expectAdminDisabled(res: Response) {
  const body = await readCodeFromResponse(res);

  expect(body.status).toBe(403);

  // Contract: we must surface ADMIN_API_DISABLED.
  // Allow either {code} or {error:{code}}; also allow plain text containing the code.
  if (body.code) {
    expect(body.code).toBe('ADMIN_API_DISABLED');
  } else {
    expect(body.raw).toContain('ADMIN_API_DISABLED');
  }
}

async function runAllMutationMethods(mod: any, reqPath: string, ctx?: any) {
  for (const m of MUTATION_METHODS) {
    const handler = mod[m];
    if (typeof handler !== 'function') continue;

    const req = makeReq(reqPath, m);
    const res: Response = ctx ? await handler(req, ctx) : await handler(req);

    await expectAdminDisabled(res);
  }
}

describe('P0-7.1 Admin API kill-switch coverage (production)', () => {
  beforeEach(() => {
    vi.resetModules();

    // Emulate production and disabled admin API.
    vi.stubEnv('NODE_ENV', 'production');
    // Treat anything except 'true' as disabled; empty string is explicitly disabled.
    vi.stubEnv('ENABLE_ADMIN_API', '');
    vi.stubEnv('APP_ORIGIN', 'https://admin.example.test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(cases)(
    'returns 403 ADMIN_API_DISABLED for all mutating handlers: $name',
    async c => {
      const mod = await import(c.importPath);

      if (c.kind === 'static') {
        await runAllMutationMethods(mod, c.path);
        return;
      }

      const path = c.path(c.id);
      const ctx = { params: { id: c.id } };

      await runAllMutationMethods(mod, path, ctx);
    }
  );
});
