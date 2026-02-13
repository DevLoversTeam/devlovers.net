# Monobank E0 Gap Report (Facts vs Proposals)

## FACTS vs PROPOSALS
- **FACTS** in this document are verified directly from repo code.
- **PROPOSALS** are suggestions only; they do **not** imply any code changes.
- **No Stripe changes** are proposed; Stripe references are read‑only for architecture parity.

---

## FACTS — Order creation (entrypoints)
- **Route handler:** `frontend/app/api/shop/checkout/route.ts`  
  - `POST` handler validates payload + Idempotency‑Key, resolves provider, then calls `createOrderWithItems(...)`.
- **Service function:** `frontend/lib/services/orders/checkout.ts`  
  - `export async function createOrderWithItems(...)` is the order creation + inventory reserve flow.
  - Uses `hashIdempotencyRequest(...)` from `frontend/lib/services/orders/_shared.ts` to enforce idempotency.

---

## FACTS — Payment attempts creation (Stripe vs Monobank)

### Stripe attempts
- **Primary entrypoint:** `frontend/lib/services/orders/payment-attempts.ts`
  - `export async function ensureStripePaymentIntentForOrder(...)`
  - Internal helpers:
    - `createActiveAttempt(...)`
    - `upsertBackfillAttemptForExistingPI(...)`
  - Uses `buildStripeAttemptIdempotencyKey(...)` from `frontend/lib/services/orders/attempt-idempotency.ts`.
- **Caller:** `frontend/app/api/shop/checkout/route.ts` invokes `ensureStripePaymentIntentForOrder(...)` in Stripe flow.

### Monobank attempts
- **Primary entrypoint:** `frontend/lib/services/orders/monobank.ts`
  - `export async function createMonoAttemptAndInvoice(...)`
  - Wrapper: `export async function createMonobankAttemptAndInvoice(...)` (builds redirect + webhook URLs and calls `createMonoAttemptAndInvoice`).
  - Internal helper: `createCreatingAttempt(...)` inserts a `payment_attempts` row with status `creating`.
  - Uses `buildMonobankAttemptIdempotencyKey(...)` from `frontend/lib/services/orders/attempt-idempotency.ts`.
- **Caller:** `frontend/app/api/shop/checkout/route.ts` (Monobank branch uses lazy import and calls `createMonobankAttemptAndInvoice(...)`).

---

## FACTS — Orders + payment_attempts data contract (schema + usage)

### Orders table (`frontend/db/schema/shop.ts`)
- **Key fields:**
  - `paymentStatus` (enum): `pending | requires_payment | paid | failed | refunded`
  - `paymentProvider` (text + CHECK): `'stripe' | 'monobank' | 'none'`
  - `status` (enum): `CREATED | INVENTORY_RESERVED | INVENTORY_FAILED | PAID | CANCELED`
  - `paymentIntentId`, `pspChargeId`, `pspStatusReason`, `pspMetadata`
  - `idempotencyKey`, `idempotencyRequestHash`
  - `stockRestored`, `restockedAt`, `inventoryStatus`
- **Usage examples:**
  - `createOrderWithItems(...)` writes `paymentProvider`, `paymentStatus`, `status`, `idempotencyKey`, `idempotencyRequestHash`.  
    (`frontend/lib/services/orders/checkout.ts`)

### payment_attempts table (`frontend/db/schema/shop.ts`)
- **Key fields:**
  - `provider` (CHECK): `'stripe' | 'monobank'`
  - `status` (CHECK): `creating | active | succeeded | failed | canceled`
  - `attemptNumber`, `currency`, `expectedAmountMinor`
  - `idempotencyKey` (unique)
  - `providerPaymentIntentId` (Stripe PI id / Monobank invoice id)
  - `checkoutUrl`, `providerCreatedAt`, `providerModifiedAt`
  - `lastErrorCode`, `lastErrorMessage`, `metadata`
  - `createdAt`, `updatedAt`, `finalizedAt`
- **Usage examples:**
  - Stripe: `ensureStripePaymentIntentForOrder(...)` creates/updates attempts and sets `providerPaymentIntentId`.  
    (`frontend/lib/services/orders/payment-attempts.ts`)
  - Monobank: `createMonoAttemptAndInvoice(...)` inserts attempt with `status='creating'` and finalizes with `providerPaymentIntentId` + `metadata.pageUrl`.  
    (`frontend/lib/services/orders/monobank.ts`)

---

## FACTS — Idempotency

### Orders
- **Fields:** `orders.idempotencyKey` and `orders.idempotencyRequestHash`  
  (`frontend/db/schema/shop.ts`)
- **Enforcement path:**  
  - `Idempotency-Key` header parsed in `frontend/app/api/shop/checkout/route.ts`  
  - `createOrderWithItems(...)` checks existing order via `getOrderByIdempotencyKey(...)` and verifies the request hash using `hashIdempotencyRequest(...)`.  
    (`frontend/lib/services/orders/summary.ts`, `frontend/lib/services/orders/_shared.ts`, `frontend/lib/services/orders/checkout.ts`)
- **Behavior (facts):**
  - If an existing order is found and the request hash matches, the existing order is returned.
  - If the request hash does not match, `IdempotencyConflictError` is thrown and the route returns a conflict response.

### Payment attempts
- **Unique constraint:** `payment_attempts_idempotency_key_unique`  
  (`frontend/db/schema/shop.ts`)
- **Builder helpers:**
  - `buildStripeAttemptIdempotencyKey(provider, orderId, attemptNo)`  
  - `buildMonobankAttemptIdempotencyKey(orderId, attemptNo)`  
  (`frontend/lib/services/orders/attempt-idempotency.ts`)
- **Usage:**
  - Stripe attempts: `createActiveAttempt(...)` / `upsertBackfillAttemptForExistingPI(...)`  
    (`frontend/lib/services/orders/payment-attempts.ts`)
  - Monobank attempts: `createCreatingAttempt(...)`  
    (`frontend/lib/services/orders/monobank.ts`)

---

## FACTS — Stripe events dedupe/claim (read‑only)
- **Route:** `frontend/app/api/shop/webhooks/stripe/route.ts`
  - Uses `tryClaimStripeEvent(...)` to claim events via `stripe_events.claimedAt/claimExpiresAt/claimedBy`.
  - Flow (high‑level): insert `stripe_events` row (dedupe), claim lease, apply updates, then mark `processedAt`.
- **Schema:** `stripe_events` in `frontend/db/schema/shop.ts`
  - Fields include: `eventId`, `paymentIntentId`, `orderId`, `eventType`, `paymentStatus`, `claimedAt`, `claimExpiresAt`, `claimedBy`, `processedAt`.
  - Unique index: `stripe_events_event_id_idx`.

---

## PROPOSAL — Monobank events parity (no Stripe changes)
**Goal:** mirror Stripe’s event persistence model without touching `stripe_events` or Stripe webhooks.

- **Table strategy:** use a provider‑scoped events table (e.g., `monobank_events` or generic `psp_events`) with `provider='monobank'`.
- **Dedupe:** `eventKey` and/or `raw_sha256` (e.g., `sha256(rawBytes)`) to prevent double‑apply.
- **Claim/lease fields:** add `claimedAt`, `claimExpiresAt`, `claimedBy` (TTL‑based) to allow multi‑instance safe applies.
- **Apply modes:** honor `apply | store | drop` modes if `MONO_WEBHOOK_MODE` exists in config (`frontend/lib/env/monobank.ts`).
- **Explicit statement:** **No changes to `stripe_events` or Stripe webhook route.**

---

## FACTS — Gaps / TODO list (observed from code)
- **No Monobank refund implementation:** `frontend/lib/services/orders/refund.ts` is Stripe‑only (Monobank refunds are not handled there).  
  (`frontend/app/api/shop/admin/orders/[id]/refund/route.ts` blocks monobank refunds when `MONO_REFUND_ENABLED=false`.)
- **No Monobank event claim/lease fields:** `monobank_events` schema does not include `claimedAt/claimExpiresAt/claimedBy` (present only in `stripe_events`).
- **No explicit Monobank event processing marker:** `monobank_events` has `appliedAt`/`appliedResult`, but no `processedAt` or claim TTL fields like Stripe’s flow.

