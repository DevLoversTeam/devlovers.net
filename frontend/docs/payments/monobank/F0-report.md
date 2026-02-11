# F0 Recon: Shop Checkout + Monobank Route Surface

## 1) Checkout route (POST /api/shop/checkout)
- Route file: `frontend/app/api/shop/checkout/route.ts`
- Handler: `export async function POST(request: NextRequest)`

## 2) API response/error + logging helpers used by checkout
- Checkout-local JSON helpers in `frontend/app/api/shop/checkout/route.ts`:
  - `errorResponse(code, message, status, details?)`
  - `buildCheckoutResponse({ order, itemCount, clientSecret, status })`
- Shared rate-limit response helper:
  - `rateLimitResponse(...)` from `frontend/lib/security/rate-limit.ts`
- Logging helpers:
  - `logWarn`, `logInfo`, `logError` from `frontend/lib/logging.ts`

Related API pattern in other shop routes:
- `noStoreJson(...)` local helper pattern appears in multiple route files (example: `frontend/app/api/shop/catalog/route.ts`, `frontend/app/api/shop/webhooks/monobank/route.ts`).

## 3) Checkout rate limit helper wiring
- Subject derivation: `getRateLimitSubject(request)` from `frontend/lib/security/rate-limit.ts`
- Enforcement: `enforceRateLimit({ key, limit, windowSeconds })`
- Rejection response: `rateLimitResponse({ retryAfterSeconds, details })`
- Checkout key format: ``checkout:${checkoutSubject}`` in `frontend/app/api/shop/checkout/route.ts`

## 4) Existing checkout request shape + provider selection
- Payload schema: `checkoutPayloadSchema` in `frontend/lib/validation/shop.ts`
  - Shape: `{ items: CheckoutItemInput[]; userId?: string }`
  - `items[]` fields: `productId`, `quantity`, optional `selectedSize`, optional `selectedColor`
  - Schema is strict.
- Provider selection in checkout route:
  - Helper: `parseRequestedProvider(raw)` in `frontend/app/api/shop/checkout/route.ts`
  - Reads `paymentProvider` or `provider` from request body object.
  - Accepts `stripe` or `monobank` (case-insensitive trim+lowercase).
  - Invalid provider -> `422 PAYMENTS_PROVIDER_INVALID`.
  - Default when omitted -> `stripe`.

## 5) Existing idempotency behavior (extraction + storage)
- Extraction in route:
  - Helper: `getIdempotencyKey(request)` in `frontend/app/api/shop/checkout/route.ts`
  - Source: HTTP header `Idempotency-Key`.
  - Validation schema: `idempotencyKeySchema` in `frontend/lib/validation/shop.ts`
    - 16..128 chars, regex `^[A-Za-z0-9_.-]+$`.
- Route-level behavior:
  - Missing -> `400 MISSING_IDEMPOTENCY_KEY`
  - Invalid format -> `400 INVALID_IDEMPOTENCY_KEY` (with zod-format details)
- Storage/usage:
  - Orders dedupe key stored/read via `orders.idempotencyKey`:
    - read path: `getOrderByIdempotencyKey(...)` in `frontend/lib/services/orders/summary.ts`
    - write/flow: `createOrderWithItems(...)` in `frontend/lib/services/orders/checkout.ts`
  - Request fingerprint stored as `orders.idempotencyRequestHash` in `createOrderWithItems(...)`.
  - Payment-attempt idempotency keys in `payment_attempts.idempotency_key`:
    - Stripe: `buildStripeAttemptIdempotencyKey(...)` in `frontend/lib/services/orders/attempt-idempotency.ts`
    - Monobank: `buildMonobankAttemptIdempotencyKey(...)` in `frontend/lib/services/orders/attempt-idempotency.ts`

## 6) Existing response/error contract in checkout
- Success response (`buildCheckoutResponse`):
  - HTTP: `200` or `201`
  - Body shape:
    - `success: true`
    - `order: { id, currency, totalAmount, itemCount, paymentStatus, paymentProvider, paymentIntentId, clientSecret }`
    - top-level mirrors: `orderId`, `paymentStatus`, `paymentProvider`, `paymentIntentId`, `clientSecret`
- Error response (`errorResponse`):
  - Body shape: `{ code: string, message: string, details?: unknown }`
  - Used status codes in this route: `400`, `409`, `422`, `500`, `502`, `503`
- Rate-limit response (`rateLimitResponse`):
  - HTTP `429`
  - Body shape: `{ success: false, code, retryAfterSeconds, details? }`

## 7) Monobank services already present (names + paths)
- Order/checkout side:
  - `createMonoAttemptAndInvoice(...)` in `frontend/lib/services/orders/monobank.ts`
  - `createMonobankAttemptAndInvoice(...)` in `frontend/lib/services/orders/monobank.ts`
- Webhook apply side:
  - `applyMonoWebhookEvent(...)` in `frontend/lib/services/orders/monobank-webhook.ts`
- PSP adapter side:
  - `createMonobankInvoice(...)` in `frontend/lib/psp/monobank.ts`
  - `cancelMonobankInvoice(...)` in `frontend/lib/psp/monobank.ts`
  - `verifyMonobankWebhookSignature(...)` in `frontend/lib/psp/monobank.ts`
  - Additional exported API methods are in `frontend/lib/psp/monobank.ts`.
