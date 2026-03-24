# Shop Checkout and Notifications Contract

## Status

Approved for launch implementation.

## Purpose

This document defines the launch contract between checkout, order persistence,
and customer notifications.

Its purpose is to remove ambiguity around guest recipient identity and
notification reliability.

---

## Core Decision

Guest checkout requires a valid email address.

This is a launch rule, not a UI preference.

---

## Why This Exists

Notification flows depend on a reliable recipient. If a guest order is created
without email, the notification pipeline can fail or dead-letter because there
is no guaranteed recipient identity. :contentReference[oaicite:2]{index=2}

The system must not rely only on:

- browser return pages,
- session state,
- manual manager copying,
- optional contact fields that may be absent.

---

## Canonical Rules

### 1. Guest Checkout

Guest checkout is allowed only if a valid email is provided.

Required:

- checkout validation rejects guest orders without email
- guest email is persisted with the order/customer-contact record
- notification flows may rely on that persisted email as the canonical recipient

Forbidden:

- silent guest order creation without a contactable email
- treating email as optional for guest flows
- relying on browser-only success UX as the only customer confirmation

### 2. Signed-In Checkout

Signed-in checkout may use the authenticated user email according to current
account rules.

Required:

- the order must still persist a canonical contact email usable by notification
  flows
- notification generation must use persisted order/account data, not manual
  copying

### 3. Notification Generation

Customer notifications must be generated from persisted order/event data.

Required sources:

- canonical order state
- canonical payment events
- canonical shipment/order lifecycle events
- persisted recipient/contact data

Forbidden:

- manual reconstruction of recipient identity at send time
- depending on transient frontend-only data after checkout completes

---

## Launch Notification Expectations

### Required Launch Behavior

The system must support reliable notification architecture based on:

- templates
- projector/event mapping
- outbox delivery
- persisted order/event/contact data

### Important Boundary

At launch, not every notification type is fully implemented yet. This document
only defines the recipient/checkout contract needed so those flows are reliable
when enabled.

---

## Checkout Validation Contract

### Guest Orders

Checkout must fail validation if:

- guest email is missing
- guest email is structurally invalid

### Signed-In Orders

Checkout may use account identity, but the final order record must still contain
a canonical usable contact email.

---

## Data Contract

The following must be true for a successfully created order:

- the order has a canonical recipient email
- the recipient email is persisted before downstream notification handling
  depends on it
- notification workers do not need to guess recipient identity from optional
  shipping-only fields

If the system stores both customer email and shipping contact email, the
canonical notification recipient must be clearly defined and used consistently.

---

## UX Contract

The UI must not imply that:

- guest email is optional
- success page alone is sufficient confirmation
- lack of email still results in normal guest notifications

The UI may say:

- order confirmations and status updates are sent to the provided email
- the email is required to complete guest checkout

---

## Error Handling Contract

If email is missing or invalid in a guest flow:

- checkout must fail early with a controlled validation error
- the order must not be created in a partially notifiable state

The system must not create an order first and discover missing recipient email
only later in the notification worker.

---

## In Scope for Launch

- mandatory guest email
- persisted canonical recipient email
- notification generation from order/event data
- validation-first rejection of non-notifiable guest orders

## Out of Scope for Launch

- guest checkout with no email
- browser-only confirmation model
- manual notification fallback as the primary designed path

---

## Summary

Launch contract:

- guest checkout: **email required**
- signed-in checkout: **must still result in canonical persisted recipient
  email**
- notifications: **generated from persisted order/event data**
- success page: **not the only confirmation channel**
