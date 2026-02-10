# Monobank Acquiring — Operations Configuration

This document describes how to configure the Monobank hosted-invoice integration for DEV/UAT/PROD without reading code. It is operational (envs, rollout, monitoring), not a developer guide.

Related docs:

- `frontend/docs/monobank-b3-verification.md` for data/index verification. Keep B3 checks separate from config.

## Overview

- Checkout can create a Monobank hosted invoice when `paymentProvider: "monobank"` is selected.
- Webhooks are verified and then either **applied**, **stored**, or **dropped** based on `MONO_WEBHOOK_MODE`.
- Admin refunds for Monobank orders are guarded by `MONO_REFUND_ENABLED`.

Key endpoints:

- Checkout: `POST /api/shop/checkout` (provider = `monobank`)
- Webhook: `POST /api/shop/webhooks/monobank`
- Admin refund: `POST /api/shop/admin/orders/:id/refund`

## Environment setup (DEV / UAT / PROD)

### DEV (local)

- Use test merchant token and public key.
- Recommended: `MONO_WEBHOOK_MODE=drop` until webhook signature verification is confirmed.
- `PAYMENTS_ENABLED` can be `false` while wiring; set to `true` only when ready to create invoices.
- Use `APP_ORIGIN=http://localhost:3000` or `SHOP_BASE_URL=http://localhost:3000`.

### UAT (staging)

- Use staging tokens (never production).
- Recommended: `MONO_WEBHOOK_MODE=store` during QA to validate signature + storage without changing order state.
- Set `SHOP_BASE_URL` to your HTTPS UAT origin.
- When ready to apply: switch to `MONO_WEBHOOK_MODE=apply`, then enable `PAYMENTS_ENABLED=true`.

### PROD

- Use live token only.
- `SHOP_BASE_URL` **must be HTTPS**.
- Recommended: `MONO_WEBHOOK_MODE=store` for first rollout, then `apply`.
- Enable `PAYMENTS_ENABLED=true` only after webhook signature verification is confirmed.
- Do not log secrets; monitor for signature failures and PSP unavailability.

## Environment variables (canonical)

> **Canonical names are `MONO_*`.**
> If you still rely on the legacy names, file a follow‑up issue to add backward‑compat or rename those envs.

### Required for Monobank invoice creation

| Variable | Required | Default | Notes |

|---|---|---|---|
| `MONO_MERCHANT_TOKEN` | Yes | — | Secret. Required for invoice creation and for fetching public key when `MONO_PUBLIC_KEY` is not provided. |
| `PAYMENTS_ENABLED` | Yes (for Monobank) | `false` | Global flag. For Monobank, `true` is required to create an invoice. Stripe uses its own gating; this doc focuses on Monobank behavior. |

### Webhook verification & networking

| Variable | Required | Default | Notes |

|---|---|---|---|
| `MONO_PUBLIC_KEY` | Optional | — | Base64/PEM public key for webhook signature verification. Recommended in PROD to avoid API fetch. |
| `MONO_API_BASE` | Optional | `https://api.monobank.ua` | Only override for staging/alternate endpoints. |
| `MONO_INVOICE_TIMEOUT_MS` | Optional | `8000` (prod) / `12000` (non‑prod) | Timeout for Monobank API calls. |

### Feature flags (Monobank only)

| Variable | Required | Default | Notes |

|---|---|---|---|
| `MONO_WEBHOOK_MODE` | No | `apply` | `drop`/`store`/`apply` (details below). Signature is always verified first. |
| `MONO_REFUND_ENABLED` | No | `false` | `true` to allow admin refunds for Monobank orders. |

### URL resolution (used for redirect/webhook URLs)

| Variable | Required | Default | Notes |

|---|---|---|---|
| `SHOP_BASE_URL` | Optional | — | Preferred base URL for absolute URLs. |
| `APP_ORIGIN` | Optional | — | Fallback if `SHOP_BASE_URL` is missing. |
| `NEXT_PUBLIC_SITE_URL` | Optional | — | Final fallback if others are missing. |

> In **production**, the resolved base URL must use `https://` or invoice creation will fail closed.

### Additional config (currently unused by runtime)

| Variable | Required | Default | Notes |

|---|---|---|---|
| `MONO_INVOICE_VALIDITY_SECONDS` | No | `86400` | Parsed and exposed in config; not yet enforced in runtime. |
| `MONO_TIME_SKEW_TOLERANCE_SEC` | No | `300` | Parsed and exposed in config; not yet enforced in runtime. |

## Feature flags behavior

### PAYMENTS_ENABLED (Monobank only path)

- If `PAYMENTS_ENABLED !== 'true'` and `paymentProvider=monobank`:
  - Checkout returns **503**:  
    `{ "code": "PAYMENTS_DISABLED", "message": "Payments are disabled." }`
  - Invoice creation is **not** attempted.

### MONO_WEBHOOK_MODE

| Mode | Behavior | Notes |

|---|---|---|
| `drop` | Verify signature, then return 200 `{ ok: true }` and **do not store or apply** | Logs `monobank_webhook_dropped`. |
| `store` | Verify signature, store event in `monobank_events`, **do not apply** | Logs `monobank_webhook_stored`. |
| `apply` | Verify signature, **apply order/payment updates** | Current implementation does **not** store events in this mode. |

### MONO_REFUND_ENABLED

- If `false` and admin refund targets a Monobank order:
  - Returns **409**:  
    `{ "code": "REFUND_DISABLED", "message": "Refunds are disabled." }`
- Stripe refunds are unaffected.

## Webhook authenticity & privacy

- Signature header: `x-sign` (or `x-signature`).
- Verification uses Monobank public key:
  - `MONO_PUBLIC_KEY` if set.
  - Otherwise, fetched from Monobank API using `MONO_MERCHANT_TOKEN`.
- If signature verification fails:
  - **401** `{ "code": "INVALID_SIGNATURE" }`
- **Do not** log tokens, signatures, or raw bodies.

## Origin posture (security)

- Webhooks are non‑browser. No Origin header is expected.
- Admin refund is a browser route with same‑origin enforcement and CSRF guard.

## Failure modes & troubleshooting

| Symptom | Likely cause | Fix |

|---|---|---|
| `422 PAYMENTS_PROVIDER_DISABLED` on checkout | `MONO_MERCHANT_TOKEN` missing | Set token. |
| `503 PAYMENTS_DISABLED` on checkout | `PAYMENTS_ENABLED` not `true` | Set `PAYMENTS_ENABLED=true` (Monobank only). |
| Webhook returns `401 INVALID_SIGNATURE` | Missing/invalid `MONO_PUBLIC_KEY` or token | Set `MONO_PUBLIC_KEY` or ensure token is valid. |
| Webhook returns 200 but order not updated | `MONO_WEBHOOK_MODE=drop` or `store` | Set `MONO_WEBHOOK_MODE=apply`. |
| Refund returns `409 REFUND_DISABLED` | `MONO_REFUND_ENABLED=false` | Set `MONO_REFUND_ENABLED=true` for Monobank. |

## Monitoring checklist

Watch for:

- `provider_disabled` (PAYMENTS_PROVIDER_DISABLED)
- `monobank_payments_disabled` (PAYMENTS_DISABLED)
- `monobank_invoice_create_failed`
- `monobank_webhook_signature_invalid` / `monobank_webhook_signature_error`
- `monobank_webhook_dropped` / `monobank_webhook_stored`
- `monobank_webhook_unknown_invoice`
- `monobank_webhook_restock_failed`
- `monobank_webhook_terminal`

Alert on:

- Sustained `INVALID_SIGNATURE` rates
- Frequent `PAYMENTS_DISABLED` in production
- Repeated `monobank_invoice_create_failed` (PSP unavailable)

## Safe rollout / rollback plan

1) Set `MONO_MERCHANT_TOKEN` and `MONO_PUBLIC_KEY`.
2) Set `SHOP_BASE_URL` (HTTPS in PROD).
3) Set `MONO_WEBHOOK_MODE=drop` and verify signature is accepted.
4) Switch to `MONO_WEBHOOK_MODE=store` to confirm event storage without applying.
5) Switch to `MONO_WEBHOOK_MODE=apply`.
6) Enable `PAYMENTS_ENABLED=true` last to allow invoice creation.
7) Rollback: set `MONO_WEBHOOK_MODE=drop` and/or `PAYMENTS_ENABLED=false`.

## Quick verification (PowerShell)

Checkout (Monobank):

```powershell
$body = @{ items = @(@{ productId = "<UUID>"; quantity = 1 }); paymentProvider = "monobank" } | ConvertTo-Json
Invoke-RestMethod -Method Post `
  -Uri "https://<host>/api/shop/checkout" `
  -Headers @{ "Idempotency-Key" = "<idem>"; "Origin" = "https://<host>"; "Content-Type" = "application/json" } `
  -Body $body
```

Webhook signature failure (expected 401 without valid signature):

```powershell
$payload = @{ invoiceId = "inv_test"; status = "success" } | ConvertTo-Json
Invoke-WebRequest -Method Post `
  -Uri "https://<host>/api/shop/webhooks/monobank" `
  -Headers @{ "Content-Type" = "application/json" } `
  -Body $payload
```

Admin refund disabled (Monobank order):

```powershell
Invoke-RestMethod -Method Post `
  -Uri "https://<host>/api/shop/admin/orders/<orderId>/refund" `
  -Headers @{ "Origin" = "https://<host>" }
```

## Notes / follow‑ups
