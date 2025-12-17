import "server-only"

import type { NextRequest } from "next/server"

import { getCurrentUser } from "@/lib/auth"

export class AdminApiDisabledError extends Error {
  code = "ADMIN_API_DISABLED" as const
  constructor(message = "Admin API is disabled by configuration") {
    super(message)
    this.name = "AdminApiDisabledError"
  }
}

export class AdminUnauthorizedError extends Error {
  code = "UNAUTHORIZED" as const
  constructor(message = "Authentication required") {
    super(message)
    this.name = "AdminUnauthorizedError"
  }
}

export class AdminForbiddenError extends Error {
  code = "FORBIDDEN" as const
  constructor(message = "Admin role required") {
    super(message)
    this.name = "AdminForbiddenError"
  }
}

/**
 * Kill-switch for production.
 * Keeps MVP safety: you can hard-disable admin mutating endpoints in prod instantly.
 */
export function assertAdminApiEnabled(): void {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_ADMIN_API !== "true") {
    throw new AdminApiDisabledError()
  }
}

/**
 * API guard: must be enabled in prod + must be authenticated admin.
 * Return value is useful if later you want audit logs (adminId, email).
 */
export async function requireAdminApi(_request?: NextRequest) {
  void _request
  assertAdminApiEnabled()

  const user = await getCurrentUser()
  if (!user) throw new AdminUnauthorizedError()

  // Harden against unexpected role strings from DB
  if (user.role !== "admin") throw new AdminForbiddenError()

  return user
}

/**
 * Page guard: same logic as API guard.
 * Use from Server Components (layouts/pages) to protect /shop/admin/**.
 */
export async function requireAdminPage() {
  assertAdminApiEnabled()

  const user = await getCurrentUser()
  if (!user) throw new AdminUnauthorizedError()
  if (user.role !== "admin") throw new AdminForbiddenError()

  return user
}
