import { NextRequest } from "next/server"

export class AdminApiDisabledError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AdminApiDisabledError"
  }
}

export function assertAdminApiEnabled(): void {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_ADMIN_API !== "true") {
    throw new AdminApiDisabledError("Admin API is disabled by configuration")
  }
}

export async function requireAdminApi(_request: NextRequest): Promise<void> {
  assertAdminApiEnabled()
  // TODO: extend this to check the current platform user/roles in the main DevLovers repo.
}
