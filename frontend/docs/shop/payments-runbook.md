# Shop Payments Runbook

## Status

Approved for launch operations.

## Purpose

This runbook defines the launch-time payment reversal policy for the Shop
module.

It is the canonical operational reference for:

- engineering,
- admin operations,
- support,
- content/legal alignment.

If admin UI, support instructions, or internal assumptions conflict with this
document, this document wins until explicitly revised.

---

## Launch Payment Rails

The launch payment rails are:

- Stripe
- Monobank

Legacy `paymentProvider='none'` is not a valid rail for new orders.

---

## Canonical Launch Policy Matrix

| Scenario                               | Stripe                                            | Monobank                                   | Returns             |
| -------------------------------------- | ------------------------------------------------- | ------------------------------------------ | ------------------- |
| New paid order creation                | Allowed                                           | Allowed                                    | Not applicable      |
| New order via `paymentProvider='none'` | Forbidden                                         | Forbidden                                  | Not applicable      |
| Unpaid payment cancellation / void     | Allowed according to existing payment state rules | Allowed for unpaid invoice/admin-only path | Not applicable      |
| Paid refund                            | Allowed                                           | Disabled for launch                        | Disabled for launch |
| Return-driven refund automation        | Disabled                                          | Disabled                                   | Disabled for launch |

---

## Operational Rules

### 1. Stripe

Stripe is the only launch rail with paid refund support.

Allowed:

- normal Stripe checkout
- webhook-driven payment confirmation
- refund of eligible paid Stripe orders through the approved admin/operational
  path

Not allowed:

- undocumented/manual refund flows outside the approved Stripe path
- assuming browser return page equals authoritative payment confirmation

### 2. Monobank

Monobank is supported for checkout, but with narrower reversal rules.

Allowed:

- normal Monobank checkout
- webhook-driven payment confirmation
- admin-only cancel/void path for unpaid invoice states when the rail logic
  allows it

Not allowed at launch:

- paid Monobank refunds from admin
- presenting Monobank as having the same refund capability as Stripe

### 3. Returns

Returns are not connected to an automatic refund workflow at launch.

Allowed:

- documenting the returns policy for customer/legal clarity
- internal manual handling outside the productized shop refund flow, if
  separately governed by business process

Not allowed at launch:

- automated return approval -> payment refund orchestration
- promising system-supported return refunds in public shop flows unless
  separately implemented

### 4. Legacy `paymentProvider='none'`

Historical rows may exist. They are legacy/internal data only.

Allowed:

- reading historical records
- preserving historical compatibility

Not allowed:

- creating new customer orders through `paymentProvider='none'`
- exposing `none` as a selectable payment path
- using `none` as a fallback when configured rails are unavailable

---

## Admin UI Rules

The admin surface must follow the actual launch policy.

Required behavior:

- unsupported actions must not appear as available
- if shown for state explanation, unsupported actions must be explicitly
  disabled
- labels/help text must not suggest unsupported refund capability

Examples:

- Stripe paid order: refund action may be available if all normal guardrails
  pass
- Monobank paid order: refund action must be hidden or disabled
- Monobank unpaid invoice: cancel/void action may be available if state permits

---

## Support / Operations Rules

Support and operations must treat rail capability as provider-specific.

Do not say:

- “all paid orders can be refunded from admin”
- “Monobank works the same as Stripe for refunds”
- “return approval automatically refunds the order”

Say instead:

- Stripe paid refunds are supported
- Monobank paid refunds are not available in the launch admin flow
- unpaid Monobank invoice cancellation may be supported depending on
  order/payment state
- return-based refund automation is not enabled at launch

---

## Authoritative Payment Confirmation

The browser return page is not the source of truth for payment success.

Authoritative confirmation must come from:

- persisted payment state,
- verified webhook/event processing,
- canonical order/payment state transitions.

Public UX may show a return/success page, but that page does not override
provider-confirmed backend state.

---

## Scope Boundaries

### In Scope for Launch

- Stripe checkout
- Monobank checkout
- Stripe refund support
- Monobank unpaid cancel/void
- explicit operational restrictions for unsupported refund paths

### Out of Scope for Launch

- Monobank paid refunds
- unified symmetric refund behavior across PSPs
- return-driven refund automation
- `paymentProvider='none'` as a new order rail

---

## Summary

Launch payment policy is intentionally narrow and explicit:

- Stripe paid refunds: **enabled**
- Monobank paid refunds: **disabled**
- Monobank unpaid cancel/void: **enabled where current state allows**
- Returns-based refunds: **disabled for launch**
- `paymentProvider='none'` for new orders: **forbidden**

This is a launch safety decision, not a statement that future support will
remain limited.
