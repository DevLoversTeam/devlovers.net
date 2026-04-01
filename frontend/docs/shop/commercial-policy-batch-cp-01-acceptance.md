# Batch CP-01 Acceptance Gate

This note is the merge/release gate for the coupled PR-C + PR-D batch.

## Scope

- Standard storefront public read paths
- Standard storefront checkout/write enforcement
- Shipping read paths for the UA storefront
- Snapshot and Monobank regression-sensitive paths

## Automated Acceptance Targets

- `uk` / `en` / `pl` public storefront reads resolve `UAH`
- Products with only a `UAH` price row stay visible on non-`uk` locales
- Stripe visibility is capability/env-based, not locale-based
- Monobank visibility is capability/env-based, not locale-based
- Shipping methods and NP lookup read paths work on non-`uk` locales for the UA
  storefront
- Standard storefront checkout persists `UAH` on `uk` / `en` / `pl`
- Provider rail selection is locale-agnostic for the standard storefront
- Client currency fields do not control persisted order currency
- Monobank payment init and idempotency remain intact
- Order item snapshots remain structurally stable after CP-01

## Manual Smoke Checklist

Manual browser smoke was not executed in the coding environment. A human release
check should confirm:

1. On `uk`, `en`, and `pl`, open catalog and PDP pages and confirm displayed
   prices are `UAH`.
2. On `uk`, `en`, and `pl`, open the cart with payments enabled and confirm both
   Stripe and Monobank options are visible.
3. On `en` or `pl`, open checkout with a shippable cart and confirm Nova Poshta
   methods load without needing locale `uk`.
4. On `en` or `pl`, complete a Stripe checkout attempt and confirm the created
   order shows `UAH`.
5. On `en` or `pl`, complete a Monobank checkout attempt and confirm the payment
   page opens and the order shows `UAH`.
6. Open checkout recovery/error/status pages and confirm displayed money remains
   `UAH` for standard storefront orders.

## Release Rule

- `intl` remains untouched in Batch CP-01.
- Schema remains untouched in Batch CP-01.
- Dormant `USD` remains a compatibility path only.
- PR-C and PR-D must ship together as one release batch.
