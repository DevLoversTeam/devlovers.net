import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const REQUIRED_NODE_RUNTIME_FILES = [
  'app/api/shop/checkout/route.ts',
  'app/api/shop/webhooks/stripe/route.ts',
  'app/api/shop/webhooks/monobank/route.ts',
  'app/api/shop/internal/monobank/janitor/route.ts',
  'app/api/shop/orders/[id]/payment/init/route.ts',
  'app/api/shop/orders/[id]/payment/monobank/invoice/route.ts',
  'app/api/shop/orders/[id]/payment/monobank/google-pay/submit/route.ts',
  'app/api/shop/admin/orders/[id]/cancel-payment/route.ts',
  'app/api/shop/admin/orders/[id]/refund/route.ts',
] as const;

describe('shop runtime explicitness', () => {
  it.each(REQUIRED_NODE_RUNTIME_FILES)(
    'declares nodejs runtime for %s',
    relativePath => {
      const absolutePath = join(process.cwd(), relativePath);
      const source = readFileSync(absolutePath, 'utf8');

      expect(source).toMatch(/export const runtime\s*=\s*['"]nodejs['"]/);
    }
  );
});
