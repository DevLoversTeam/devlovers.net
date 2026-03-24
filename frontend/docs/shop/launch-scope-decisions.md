# Shop Launch Scope Decisions

## Status

Approved for launch planning.

## Purpose

This document fixes the business decisions that define launch scope for the Shop
module. These decisions exist to remove ambiguity before implementation work
continues.

They are launch-policy decisions, not future-state product strategy. Anything
not explicitly enabled here is out of scope for launch.

---

## 0.1 Inventory Policy

### Decision: Product-Level Stock Only

Launch uses **product-level stock only**.

### Meaning

- Stock is tracked at the **product level**.
- The shop does **not** support variant-level inventory at launch.
- Variant-specific stock reservation, decrement, restock, or reconciliation are
  **out of scope**.
- If the UI shows options such as size/color, they must **not** imply separate
  inventory unless that capability is implemented end-to-end.

### Why (Inventory Complexity)

Variant-level inventory introduces additional complexity in:

- stock reservation,
- checkout validation,
- order item snapshotting,
- admin stock updates,
- oversell prevention,
- refund/restock behavior.

That complexity is not required for launch and would expand scope without
improving launch safety.

### Implementation Contract (Inventory)

- Checkout and stock validation must use product-level inventory only.
- Admin inventory operations must update product-level stock only.
- Any fake or presentation-only variant options must not affect pricing, stock,
  or fulfillment logic.

### Out of Scope for Launch: Inventory

- Variant SKU inventory
- Variant stock reservation
- Variant restock flows
- Variant-specific operational reporting

---

## 0.2 Refund / Void Policy Matrix

### Decision: Payment Reversal Policy

Launch uses the following payment reversal policy:

| Flow                                                   | Launch Policy                                     |
| ------------------------------------------------------ | ------------------------------------------------- |
| Stripe paid order refund                               | Allowed                                           |
| Stripe unpaid / incomplete payment cancellation        | Allowed according to existing payment state rules |
| Monobank unpaid invoice void / cancellation            | Allowed                                           |
| Monobank paid refund                                   | Disabled for launch                               |
| Return-based refunds                                   | Disabled for launch                               |
| `paymentProvider='none'` for new orders                | Forbidden                                         |
| Legacy historical orders with `paymentProvider='none'` | Read-only / legacy only                           |

### Meaning (Refund Policy)

The launch refund model is intentionally narrow. Only reversal paths that are
already operationally safe and clearly supported are enabled.

### Why (Payment Reversal Safety)

The goal is to avoid partial or ambiguous payment reversal behavior in
production. Refund logic must be explicit per rail, not assumed to be symmetric
across providers.

### Operational Contract (Refunds)

- A paid Stripe order may be refunded through the approved Stripe refund flow.
- A Monobank payment that has not been captured / finalized may be canceled or
  voided if the current rail logic supports that state.
- Paid Monobank refunds are not available to admins at launch.
- Returns are not an automatic refund source at launch; there is no
  return-to-refund automation.
- New orders must never be created with `paymentProvider='none'`.

### UI / Admin Contract

- Admin UI must not expose unavailable refund actions.
- Unsupported actions must be either hidden or explicitly disabled.
- Public/legal/help content must not promise refund capabilities that are not
  actually enabled.

### Out of Scope for Launch: Refunds

- Symmetric refund support across all PSPs
- Automated returns workflow
- Return approval -> refund orchestration
- Cross-provider unified refund console

---

## 0.3 Guest Email Policy

### Decision: Email Required for Guest Checkout

Guest checkout requires **email as a mandatory field**.

### Meaning (Guest Email)

- A guest order cannot be created without a valid email address.
- Email is a required part of the checkout contract.
- Notifications for guest orders rely on the persisted checkout email.

### Why (Guest Notifications)

Guest notifications, confirmations, and recovery flows are not reliable if the
order has no email recipient. A guest checkout without email creates avoidable
operational gaps.

### Implementation Contract (Guest Email)

- Checkout validation must reject guest orders without email.
- Notification flows may assume a valid persisted email exists for guest orders.
- Signed-in users may still use their account email according to current account
  rules.

### Data Contract

- Guest email must be stored with the order in the canonical
  order/customer-contact record used by notification flows.
- The system must not rely only on browser return pages as proof of successful
  order communication.

### Out of Scope for Launch: Guest Email

- Guest checkout without email
- Notification fallback based only on browser/session state
- Silent guest order creation with no contactable recipient

---

## 0.4 Legal Merchant Identity Set

### Decision: Complete Seller Identity Block

Launch must publish a complete seller identity block.

### Required Published Fields

The public shop legal/contact area must include:

- Merchant legal name
- Store / trading name, if different from legal name
- Support email
- Support phone
- Business or registered address
- Registration details required by the operating jurisdiction

### Meaning (Legal Identity)

The shop must identify the seller as a real merchant entity, not only as a brand
page with generic contact links.

### Why (Customer Trust)

Customers must be able to identify who is selling the goods, how to contact the
seller, and what legal/business identity stands behind the storefront.

### Content Contract

The seller identity block must be consistent across:

- legal pages,
- footer or contact surfaces where applicable,
- checkout/help/customer-facing policy content.

### Note

The exact registration fields must match the merchant’s actual jurisdiction and
compliance requirements. Legal/business details must be verified before public
publication.

### Out of Scope for Launch

- Placeholder merchant identity text
- Brand-only contact presentation with no merchant details
- Publishing incomplete or unverified registration information

---

## Launch Interpretation Rule

These decisions define the launch contract. If implementation, UI,
documentation, or admin tooling conflicts with this document, this document wins
until explicitly revised.

Any future expansion beyond this scope must be approved as a new decision and
implemented intentionally.

---

## Summary of Approved Launch Decisions

- Inventory: **product-level stock only**
- Refunds: **Stripe refund allowed; Monobank paid refund disabled; Monobank
  unpaid void allowed; return-based refunds disabled**
- Guest checkout: **email required**
- Legal identity: **full merchant identity block required**

---

## Change Control

This document should be updated only when launch policy changes are explicitly
approved. Do not expand operational behavior implicitly in code without updating
this document.
