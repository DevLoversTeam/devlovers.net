import crypto from 'node:crypto';

import { expect, type Page, test } from '@playwright/test';
import { Pool } from 'pg';

import { createStatusToken } from '@/lib/shop/status-token';

const REQUIRED_LOCAL_DB_URL =
  process.env.REQUIRED_LOCAL_DB_URL ?? process.env.LOCAL_DB_URL ?? '';
const ALLOWED_LOCAL_DB_HOSTS = new Set(['localhost', '127.0.0.1']);

function assertStrictLocalDbGuard() {
  const appEnv = (process.env.APP_ENV ?? '').trim().toLowerCase();
  const databaseUrlLocal = process.env.DATABASE_URL_LOCAL ?? '';
  const databaseUrl = process.env.DATABASE_URL ?? '';
  const strictLocalDb = (process.env.SHOP_STRICT_LOCAL_DB ?? '').trim();
  const requiredLocalDb = process.env.SHOP_REQUIRED_DATABASE_URL_LOCAL ?? '';
  const statusTokenSecret = (process.env.SHOP_STATUS_TOKEN_SECRET ?? '').trim();

  if (!REQUIRED_LOCAL_DB_URL.trim()) {
    throw new Error(
      'E2E requires REQUIRED_LOCAL_DB_URL or LOCAL_DB_URL to be set.'
    );
  }

  if (appEnv !== 'local') {
    throw new Error(
      `E2E requires APP_ENV=local, got "${appEnv || '<empty>'}".`
    );
  }

  if (databaseUrlLocal !== REQUIRED_LOCAL_DB_URL) {
    throw new Error(
      'E2E requires DATABASE_URL_LOCAL to match REQUIRED_LOCAL_DB_URL/LOCAL_DB_URL exactly.'
    );
  }

  if (databaseUrl.trim().length > 0) {
    let parsedDatabaseUrl: URL;
    try {
      parsedDatabaseUrl = new URL(databaseUrl);
    } catch {
      throw new Error(
        'E2E DATABASE_URL must be blank/whitespace or a valid local URL.'
      );
    }

    if (!ALLOWED_LOCAL_DB_HOSTS.has(parsedDatabaseUrl.hostname)) {
      throw new Error(
        `Refusing to run E2E with non-local DATABASE_URL host: ${parsedDatabaseUrl.hostname}`
      );
    }
  }

  if (strictLocalDb !== '1') {
    throw new Error('E2E requires SHOP_STRICT_LOCAL_DB=1.');
  }

  if (requiredLocalDb !== REQUIRED_LOCAL_DB_URL) {
    throw new Error(
      'E2E requires SHOP_REQUIRED_DATABASE_URL_LOCAL to match DATABASE_URL_LOCAL.'
    );
  }

  if (!statusTokenSecret) {
    throw new Error('E2E requires SHOP_STATUS_TOKEN_SECRET to be set.');
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrlLocal);
  } catch {
    throw new Error('E2E DATABASE_URL_LOCAL must be a valid URL.');
  }

  if (!ALLOWED_LOCAL_DB_HOSTS.has(parsed.hostname)) {
    throw new Error(
      `Refusing to run E2E against non-local DB host: ${parsed.hostname}`
    );
  }
}

assertStrictLocalDbGuard();

const pool = new Pool({ connectionString: REQUIRED_LOCAL_DB_URL });

type SeededProduct = {
  id: string;
  slug: string;
  title: string;
  priceMinorUah: number;
};

type SeededCity = {
  ref: string;
  nameUa: string;
};

type CleanupBucket = {
  orderIds: string[];
  productIds: string[];
  cityRefs: string[];
};

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

async function seedProduct(tag: string): Promise<SeededProduct> {
  const id = crypto.randomUUID();
  const short = id.slice(0, 8);
  const slug = `e2e-${tag}-${short}`;
  const title = `E2E ${tag} ${short}`;
  const sku = `SKU-${short}`;
  const priceMinorUsd = 1399;
  const priceMinorUah = 5120;

  await pool.query(
    `
      insert into products (
        id,
        slug,
        title,
        description,
        image_url,
        image_public_id,
        price,
        original_price,
        currency,
        category,
        type,
        colors,
        sizes,
        badge,
        is_active,
        is_featured,
        stock,
        sku,
        created_at,
        updated_at
      )
      values (
        $1::uuid,
        $2,
        $3,
        $4,
        '/placeholder.svg',
        null,
        ($5::numeric / 100),
        null,
        'USD',
        'apparel',
        'shirts',
        '{}'::text[],
        '{}'::text[],
        'NONE',
        true,
        true,
        100,
        $6,
        now(),
        now()
      )
    `,
    [id, slug, title, `Local E2E product ${short}`, priceMinorUsd, sku]
  );

  await pool.query(
    `
      insert into product_prices (
        product_id,
        currency,
        price_minor,
        original_price_minor,
        price,
        original_price,
        created_at,
        updated_at
      )
      values
        (
          $1::uuid,
          'USD',
          $2::integer,
          null,
          (($2::integer)::numeric / 100),
          null,
          now(),
          now()
        ),
        (
          $1::uuid,
          'UAH',
          $3::integer,
          null,
          (($3::integer)::numeric / 100),
          null,
          now(),
          now()
        )
    `,
    [id, priceMinorUsd, priceMinorUah]
  );

  return {
    id,
    slug,
    title,
    priceMinorUah,
  };
}

async function seedCity(tag: string): Promise<SeededCity> {
  const ref = `npcity-${crypto.randomUUID().replace(/-/g, '')}`;
  const runId = crypto.randomUUID();
  const nameUa = `E2E City ${tag}`;

  await pool.query(
    `
      insert into np_cities (
        ref,
        name_ua,
        name_ru,
        area,
        region,
        settlement_type,
        is_active,
        last_sync_run_id,
        created_at,
        updated_at
      )
      values (
        $1,
        $2,
        null,
        null,
        null,
        'city',
        true,
        $3::uuid,
        now(),
        now()
      )
      on conflict (ref) do update
      set
        name_ua = excluded.name_ua,
        is_active = true,
        last_sync_run_id = excluded.last_sync_run_id,
        updated_at = now()
    `,
    [ref, nameUa, runId]
  );

  return { ref, nameUa };
}

async function insertOrder(args: {
  orderId: string;
  currency: 'USD' | 'UAH';
  totalAmountMinor: number;
  paymentProvider: 'stripe' | 'monobank';
  paymentStatus:
    | 'pending'
    | 'requires_payment'
    | 'paid'
    | 'failed'
    | 'refunded'
    | 'needs_review';
  status?:
    | 'CREATED'
    | 'INVENTORY_RESERVED'
    | 'INVENTORY_FAILED'
    | 'PAID'
    | 'CANCELED';
  inventoryStatus?:
    | 'none'
    | 'reserving'
    | 'reserved'
    | 'release_pending'
    | 'released'
    | 'failed';
  pspPaymentMethod?: 'stripe_card' | 'monobank_invoice' | 'monobank_google_pay';
  pspMetadata?: Record<string, unknown>;
}) {
  await pool.query(
    `
      insert into orders (
        id,
        user_id,
        idempotency_key,
        total_amount_minor,
        total_amount,
        currency,
        fulfillment_mode,
        quote_status,
        items_subtotal_minor,
        shipping_required,
        shipping_payer,
        shipping_provider,
        shipping_method_code,
        shipping_amount_minor,
        shipping_status,
        payment_status,
        payment_provider,
        payment_intent_id,
        psp_charge_id,
        psp_payment_method,
        psp_status_reason,
        psp_metadata,
        status,
        inventory_status,
        stock_restored,
        restocked_at,
        idempotency_request_hash,
        created_at,
        updated_at
      )
      values (
        $1::uuid,
        null,
        $2,
        $3::integer,
        (($3::integer)::numeric / 100),
        $4,
        'ua_np',
        'none',
        $9::bigint,
        false,
        null,
        null,
        null,
        null,
        null,
        $5,
        $6,
        null,
        null,
        $10,
        null,
        coalesce($11::jsonb, '{}'::jsonb),
        $7,
        $8,
        false,
        null,
        null,
        now(),
        now()
      )
    `,
    [
      args.orderId,
      `e2e:${args.orderId}`,
      args.totalAmountMinor,
      args.currency,
      args.paymentStatus,
      args.paymentProvider,
      args.status ?? 'INVENTORY_RESERVED',
      args.inventoryStatus ?? 'reserved',
      args.totalAmountMinor,
      args.pspPaymentMethod ?? null,
      args.pspMetadata ? JSON.stringify(args.pspMetadata) : null,
    ]
  );
}

async function cleanupOrder(orderId: string) {
  await pool.query('delete from admin_audit_log where order_id = $1::uuid', [
    orderId,
  ]);
  await pool.query('delete from orders where id = $1::uuid', [orderId]);
}

async function cleanupProduct(productId: string) {
  await pool.query('delete from inventory_moves where product_id = $1::uuid', [
    productId,
  ]);
  await pool.query('delete from order_items where product_id = $1::uuid', [
    productId,
  ]);
  await pool.query('delete from product_prices where product_id = $1::uuid', [
    productId,
  ]);
  await pool.query('delete from products where id = $1::uuid', [productId]);
}

async function cleanupLegacyInvalidE2EProducts() {
  const result = await pool.query(
    `
      select id
      from products
      where slug like 'e2e-%'
        and (
          lower(coalesce(category, '')) = 'e2e'
          or lower(coalesce(type, '')) = 'e2e'
        )
    `
  );

  for (const row of result.rows as Array<{ id: string }>) {
    await cleanupProduct(row.id);
  }
}

async function cleanupLegacySnapshotTestProducts() {
  const result = await pool.query(
    `
      select id
      from products
      where slug like 'snapshot-test-%'
         or image_url = 'https://res.cloudinary.com/devlovers/image/upload/v1/test.png'
    `
  );

  for (const row of result.rows as Array<{ id: string }>) {
    await cleanupProduct(row.id);
  }
}

async function cleanupCity(ref: string) {
  await pool.query('delete from np_warehouses where city_ref = $1', [ref]);
  await pool.query('delete from np_cities where ref = $1', [ref]);
}

async function getOrderPaymentState(orderId: string): Promise<{
  paymentStatus: string;
  totalAmountMinor: number;
} | null> {
  const result = await pool.query(
    `
      select
        payment_status as "paymentStatus",
        total_amount_minor as "totalAmountMinor"
      from orders
      where id = $1::uuid
      limit 1
    `,
    [orderId]
  );

  const row = result.rows[0] as
    | { paymentStatus: unknown; totalAmountMinor: unknown }
    | undefined;
  if (!row) return null;

  const paymentStatus = String(row.paymentStatus ?? '').trim();
  const totalAmountMinor = Number(row.totalAmountMinor ?? NaN);

  if (!paymentStatus || !Number.isFinite(totalAmountMinor)) return null;

  return {
    paymentStatus,
    totalAmountMinor,
  };
}

async function cleanupSeededData(bucket: CleanupBucket) {
  const failures: string[] = [];

  for (const orderId of [...bucket.orderIds].reverse()) {
    try {
      await cleanupOrder(orderId);
    } catch (error) {
      failures.push(
        `cleanupOrder(orderId=${orderId}) failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  for (const productId of [...bucket.productIds].reverse()) {
    try {
      await cleanupProduct(productId);
    } catch (error) {
      failures.push(
        `cleanupProduct(productId=${productId}) failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  for (const cityRef of [...bucket.cityRefs].reverse()) {
    try {
      await cleanupCity(cityRef);
    } catch (error) {
      failures.push(
        `cleanupCity(cityRef=${cityRef}) failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  if (failures.length > 0) {
    throw new Error(`Seed cleanup failed:\n${failures.join('\n')}`);
  }
}

async function addSeededProductToCart(args: {
  locale: 'en' | 'uk';
  page: Page;
  product: SeededProduct;
}) {
  const { locale, page, product } = args;

  await page.goto(`/${locale}/shop/products`);
  await expect(page).toHaveURL(
    new RegExp(`/${locale}/shop/products(?:\\?.*)?$`)
  );

  await page.goto(`/${locale}/shop/products/${product.slug}`);

  await expect(page).toHaveURL(
    new RegExp(`/${locale}/shop/products/${product.slug}$`)
  );

  // Keep flow deterministic: seed guest cart storage directly after product page visit.
  await page.evaluate(productId => {
    window.localStorage.setItem(
      'devlovers-cart:guest',
      JSON.stringify([{ productId, quantity: 1 }])
    );
  }, product.id);
  await page.context().addCookies([
    {
      name: 'NEXT_LOCALE',
      value: locale,
      url: 'http://127.0.0.1:3100',
    },
  ]);

  await page.goto(`/${locale}/shop/cart`);
  await expect(page.getByRole('link', { name: product.title })).toBeVisible();
  await expect(page.locator('button[aria-busy]')).toBeVisible();
}

async function stopActivePageEffects(page: Page) {
  try {
    await page.route('**/api/shop/orders/*/status*', route => route.abort());
  } catch {
    // no-op
  }

  try {
    await page.goto('about:blank');
  } catch {
    // no-op
  }

  try {
    await page.waitForTimeout(250);
  } catch {
    // no-op
  }
}

test.describe('shop checkout local UX', () => {
  test.beforeAll(async () => {
    await cleanupLegacyInvalidE2EProducts();
    await cleanupLegacySnapshotTestProducts();
  });

  test.afterAll(async () => {
    await pool.end();
  });

  test('happy path: catalog -> product -> cart -> checkout (stripe) keeps non-paid state until confirmation', async ({
    page,
  }) => {
    const bucket: CleanupBucket = {
      orderIds: [],
      productIds: [],
      cityRefs: [],
    };

    try {
      const product = await seedProduct('happy');
      bucket.productIds.push(product.id);

      const city = await seedCity(`happy-${crypto.randomUUID().slice(0, 6)}`);
      bucket.cityRefs.push(city.ref);

      await addSeededProductToCart({ locale: 'uk', page, product });

      await expect(
        page.locator('input[name="delivery-method"][value="NP_COURIER"]')
      ).toHaveCount(1);
      await page
        .locator('input[name="delivery-method"][value="NP_COURIER"]')
        .setChecked(true, { force: true });
      const stripeProviderRadio = page.locator(
        'input[name="payment-provider"][value="stripe"]'
      );
      const monobankProviderRadio = page.locator(
        'input[name="payment-provider"][value="monobank"]'
      );

      await expect(stripeProviderRadio).toBeChecked();
      await expect(monobankProviderRadio).toBeEnabled();

      await monobankProviderRadio.setChecked(true, { force: true });
      await expect(monobankProviderRadio).toBeChecked();
      await expect(
        page.locator(
          'input[name="payment-method-monobank"][value="monobank_invoice"]'
        )
      ).toBeVisible();

      await stripeProviderRadio.setChecked(true, { force: true });
      await expect(stripeProviderRadio).toBeChecked();
      await expect(
        page.locator('input[name="payment-method-monobank"]')
      ).toHaveCount(0);

      await page.fill('#shipping-city-search', city.nameUa.slice(0, 6));
      await page
        .getByRole('button', { name: city.nameUa, exact: true })
        .click();

      await page.fill('#shipping-address-1', 'Test Street 10, apt 4');
      await page.fill('#recipient-name', 'QA Local Tester');
      await page.fill('#recipient-phone', '+380501112233');

      const cartTotalText = (
        await page.locator('aside .text-2xl.font-bold').first().innerText()
      ).trim();

      const placeOrderButton = page.locator('button[aria-busy]');
      await expect(placeOrderButton).toBeEnabled();
      await placeOrderButton.click();

      await expect(page).toHaveURL(
        /\/uk\/shop\/checkout\/payment\/[0-9a-f-]{36}/
      );

      const currentPaymentUrl = new URL(page.url());
      const createdOrderId = currentPaymentUrl.pathname.split('/').pop() ?? '';
      const statusTokenFromRedirect =
        currentPaymentUrl.searchParams.get('statusToken');

      expect(createdOrderId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      bucket.orderIds.push(createdOrderId);

      if (!statusTokenFromRedirect) {
        throw new Error(
          [
            'E2E checkout redirect is missing statusToken.',
            `orderId=${createdOrderId}`,
            `url=${currentPaymentUrl.toString()}`,
          ].join(' ')
        );
      }

      await expect(
        page.locator('section[aria-label="Payment details"]')
      ).toBeVisible();

      const paymentAmountText = (
        await page
          .locator('aside[aria-label="Order summary"] dd')
          .nth(1)
          .innerText()
      ).trim();
      expect(digitsOnly(paymentAmountText)).toBe(digitsOnly(cartTotalText));

      const orderState = await getOrderPaymentState(createdOrderId);
      expect(orderState).toBeTruthy();
      expect(orderState?.paymentStatus).not.toBe('paid');
      expect(orderState?.totalAmountMinor).toBe(product.priceMinorUah);
      await expect(page.getByText('Payment confirmed')).toHaveCount(0);
    } finally {
      await stopActivePageEffects(page);
      await cleanupSeededData(bucket);
    }
  });

  test('shipping validation hard-block: invalid delivery payload blocks checkout initiation', async ({
    page,
  }) => {
    const bucket: CleanupBucket = {
      orderIds: [],
      productIds: [],
      cityRefs: [],
    };

    try {
      const product = await seedProduct('shipping-block');
      bucket.productIds.push(product.id);

      await addSeededProductToCart({ locale: 'uk', page, product });

      await page
        .locator('input[name="delivery-method"][value="NP_COURIER"]')
        .setChecked(true, { force: true });

      let checkoutRequestCount = 0;
      await page.route('**/api/shop/checkout', async route => {
        checkoutRequestCount += 1;
        await route.continue();
      });

      const placeOrderButton = page.locator('button[aria-busy]');
      await expect(placeOrderButton).toBeEnabled();
      await placeOrderButton.click();

      await expect(page.locator('p[role="alert"]').first()).toBeVisible();
      expect(checkoutRequestCount).toBe(0);
      await expect(page).toHaveURL(/\/uk\/shop\/cart$/);
    } finally {
      await stopActivePageEffects(page);
      await cleanupSeededData(bucket);
    }
  });

  test('payment gating UX: incompatible currency keeps monobank rail non-usable', async ({
    page,
  }) => {
    const bucket: CleanupBucket = {
      orderIds: [],
      productIds: [],
      cityRefs: [],
    };

    try {
      const product = await seedProduct('usd-gating');
      bucket.productIds.push(product.id);

      await addSeededProductToCart({ locale: 'en', page, product });

      const monobankProvider = page.locator(
        'input[name="payment-provider"][value="monobank"]'
      );
      await expect(monobankProvider).toBeDisabled();

      await expect(
        page.getByText('Monobank is available only for UAH checkout.')
      ).toBeVisible();
      await expect(
        page.locator('input[name="payment-provider"][value="stripe"]')
      ).toBeChecked();
      await expect(
        page.locator('input[name="payment-method-monobank"]')
      ).toHaveCount(0);
    } finally {
      await stopActivePageEffects(page);
      await cleanupSeededData(bucket);
    }
  });

  test('explicit non-wallet fallback UX: monobank payment page exposes invoice fallback and keeps flow local', async ({
    page,
  }) => {
    const bucket: CleanupBucket = {
      orderIds: [],
      productIds: [],
      cityRefs: [],
    };

    try {
      const orderId = crypto.randomUUID();
      bucket.orderIds.push(orderId);

      await insertOrder({
        orderId,
        currency: 'UAH',
        totalAmountMinor: 3100,
        paymentProvider: 'monobank',
        paymentStatus: 'pending',
        pspPaymentMethod: 'monobank_google_pay',
      });

      const statusToken = createStatusToken({
        orderId,
        scopes: ['status_lite', 'order_payment_init'],
      });

      await page.route('https://pay.google.com/gp/p/js/pay.js', async route => {
        await route.abort();
      });

      let invoiceFallbackCalls = 0;
      await page.route(
        `**/api/shop/orders/${orderId}/payment/monobank/invoice*`,
        async route => {
          invoiceFallbackCalls += 1;
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              pageUrl: `/uk/shop/checkout/return/monobank?orderId=${encodeURIComponent(
                orderId
              )}&statusToken=${encodeURIComponent(statusToken)}&clearCart=1`,
            }),
          });
        }
      );

      await page.goto(
        `/uk/shop/checkout/payment/monobank/${encodeURIComponent(
          orderId
        )}?statusToken=${encodeURIComponent(statusToken)}`
      );

      const gpaySection = page.locator(
        'section[aria-label="Monobank Google Pay"]'
      );
      await expect(gpaySection).toBeVisible();

      const fallbackButton = gpaySection.getByRole('button').first();
      await expect(fallbackButton).toBeVisible();
      await fallbackButton.click();

      await expect.poll(() => invoiceFallbackCalls).toBe(1);
      await expect(page).toHaveURL(
        new RegExp(`/uk/shop/checkout/return/monobank\\?orderId=${orderId}`)
      );
      await expect(page.getByText('Payment confirmed')).toHaveCount(0);
    } finally {
      await stopActivePageEffects(page);
      await cleanupSeededData(bucket);
    }
  });

  test('pending return UX: pending state stays non-paid and does not redirect to success', async ({
  page,
}) => {
  const bucket: CleanupBucket = {
    orderIds: [],
    productIds: [],
    cityRefs: [],
  };

  try {
    const orderId = crypto.randomUUID();
    bucket.orderIds.push(orderId);

    await insertOrder({
      orderId,
      currency: 'UAH',
      totalAmountMinor: 4200,
      paymentProvider: 'monobank',
      paymentStatus: 'pending',
    });

    const statusToken = createStatusToken({
      orderId,
      scopes: ['status_lite'],
    });

    let pendingStatusPollCount = 0;

    await page.route(
      `**/api/shop/orders/${orderId}/status?**`,
      async route => {
        pendingStatusPollCount += 1;

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            orderId,
            paymentStatus: 'pending',
            paymentProvider: 'monobank',
            status: 'INVENTORY_RESERVED',
            inventoryStatus: 'reserved',
            canRetryPayment: false,
            canCancel: false,
          }),
        });
      }
    );

    await page.goto(
      `/en/shop/checkout/return/monobank?orderId=${encodeURIComponent(
        orderId
      )}&statusToken=${encodeURIComponent(statusToken)}`
    );

    await expect(
      page.getByRole('heading', { name: 'Processing payment...' })
    ).toBeVisible();

    await expect(page.getByText('Payment pending')).toBeVisible({
      timeout: 10_000,
    });

    await expect.poll(() => pendingStatusPollCount).toBeGreaterThan(0);
    await expect(page).toHaveURL(/\/en\/shop\/checkout\/return\/monobank/);
    await expect(page.getByText('Payment confirmed')).toHaveCount(0);
  } finally {
    await stopActivePageEffects(page);
    await cleanupSeededData(bucket);
  }
});

  test('failure/cancel return UX: failed state remains non-paid and retry path is usable', async ({
    page,
    request,
  }) => {
    const bucket: CleanupBucket = {
      orderIds: [],
      productIds: [],
      cityRefs: [],
    };

    try {
      const orderId = crypto.randomUUID();
      bucket.orderIds.push(orderId);

      await insertOrder({
        orderId,
        currency: 'USD',
        totalAmountMinor: 2500,
        paymentProvider: 'stripe',
        paymentStatus: 'failed',
      });

      const statusToken = createStatusToken({
        orderId,
        scopes: ['status_lite', 'order_payment_init'],
      });

      await page.goto(
        `/en/shop/checkout/error?orderId=${encodeURIComponent(
          orderId
        )}&statusToken=${encodeURIComponent(statusToken)}`
      );

      await expect(
        page.getByRole('heading', { name: 'Payment failed' })
      ).toBeVisible();
      await expect(
        page.locator('dd.text-foreground.font-semibold.capitalize').filter({
          hasText: /^failed$/i,
        })
      ).toBeVisible();
      await expect(page.getByText('Payment confirmed')).toHaveCount(0);

      await page.getByRole('link', { name: 'Retry payment' }).click();

      await expect(page).toHaveURL(
        new RegExp(`/en/shop/checkout/payment/${orderId}\\?statusToken=`)
      );
      await expect(
        page.getByRole('heading', { name: /Pay for order #/ })
      ).toBeVisible();

      const statusRes = await request.get(
        `/api/shop/orders/${encodeURIComponent(
          orderId
        )}/status?view=lite&statusToken=${encodeURIComponent(statusToken)}`
      );
      expect(statusRes.status()).toBe(200);
      const statusBody = await statusRes.json();
      expect(statusBody.paymentStatus).toBe('failed');
    } finally {
      await stopActivePageEffects(page);
      await cleanupSeededData(bucket);
    }
  });
});
