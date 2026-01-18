# Origin Posture (Shop APIs)

## Why this exists
CORS, CSRF, and origin checks solve different problems:

- **CORS** is a browser-enforced policy that controls which origins can read responses. It does **not** prevent requests from being sent, and it is not an auth mechanism.
- **CSRF protections** (tokens, SameSite cookies) prevent attackers from abusing a victim's browser session on state-changing requests.
- **Origin / Fetch Metadata** checks let the server detect browser context and block cross-origin browser requests before they reach application logic.

This application does **not** support cross-origin browser calls for admin or checkout flows. We explicitly enforce this posture at the application layer (no Cloudflare/WAF assumed).

## Our posture (fail-closed)
**No cross-origin browser usage.**

- **Browser-exposed endpoints** (admin + checkout) only allow **same-origin** browser requests.
- **Non-browser endpoints** (internal/cron + webhooks) reject **browser-like** requests entirely.

### Browser-exposed endpoints (same-origin only)
For unsafe methods (`POST`, `PATCH`, `PUT`, `DELETE`):

- Require an `Origin` header.
- The `Origin` must match the allowlist built from `APP_ORIGIN` and `APP_ADDITIONAL_ORIGINS`.
- If either condition fails, return `403 ORIGIN_NOT_ALLOWED`.

CSRF checks remain in place and are still required.

### Non-browser endpoints (reject browser context)
For internal and webhook routes:

- Reject requests that include an `Origin` header **or** `Sec-Fetch-Site` that is not `none`.
- Return `403 BROWSER_CONTEXT_NOT_ALLOWED`.
- Canonical auth remains:
  - Internal endpoints rely on internal tokens.
  - Stripe webhooks rely on Stripe signature verification.

### Browser policy headers
We do not add `Access-Control-Allow-*` headers. Cross-origin browser access is not a supported integration pattern for these APIs.

## Environment variables
- `APP_ORIGIN` (required in production): the primary allowed origin.
- `APP_ADDITIONAL_ORIGINS` (optional): comma-separated list of extra allowed origins.
- In non-production environments, `http://localhost:3000` is added if missing.

## Enforcement location
All enforcement is implemented in **Next.js route handlers** in `frontend/app/api/**/route.ts`.
No Cloudflare/WAF or external middleware is assumed.
