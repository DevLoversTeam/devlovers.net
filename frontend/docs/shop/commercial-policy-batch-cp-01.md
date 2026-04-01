# Shop Commercial Policy Memo

## Status

Approved for Batch CP-01 preparation work.

This memo was written for PR-A to record the intended policy before the runtime
switches landed in later CP-01 PRs.

## Purpose

This memo records the target commercial policy for the standard Shop storefront
without changing runtime behavior in PR-A.

It exists to keep policy decisions explicit while checkout/storefront
implementation work is staged across later PRs.

---

## Batch CP-01 Policy

### 1. Locale

Locale is a language/content selector only.

Locale must not be the long-term source of truth for:

- storefront currency,
- payment rail availability,
- commercial market selection.

### 2. Standard Storefront Currency

The standard storefront currency target is **UAH** on all locales.

This is the intended commercial policy for the standard storefront, not a
statement that runtime behavior has already switched in this PR.

### 3. Standard Storefront Payment Providers

The standard storefront payment rails are:

- Stripe
- Monobank

Provider availability must ultimately be controlled by env/runtime capability
only. Locale must not be the gate.

### 4. Intl Flow

The existing `intl` flow remains untouched in Batch CP-01.

This batch does not redesign, widen, or clean up the `intl` quote/payment
contract.

### 5. Dormant USD Compatibility

USD compatibility remains temporarily in place as a dormant compatibility path.

This includes legacy/storage compatibility that may still be required while the
policy refactor is staged safely.

Batch CP-01 does not require immediate USD removal.

### 6. Schema Cleanup

No schema cleanup is part of this batch.

That means:

- no migrations,
- no enum cleanup,
- no legacy compatibility removal,
- no destructive price/currency schema changes.

---

## PR-A Scope Guardrail

PR-A is preparation only.

Allowed in PR-A:

- documenting the policy,
- repairing stale targeted tests so they reach their intended assertions.

Not allowed in PR-A:

- switching storefront currency behavior,
- switching checkout/provider enforcement behavior,
- changing admin pricing policy,
- cleaning up schema or dormant compatibility paths.

---

## Interpretation Rule

If code, tests, or follow-up implementation planning conflict with this memo,
this memo defines the intended Batch CP-01 target policy.

Runtime behavior changes must be delivered only in later PRs with explicit scope
approval.
