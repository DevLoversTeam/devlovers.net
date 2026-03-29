import 'server-only';

import type { NextRequest } from 'next/server';
import { readServerEnv } from '@/lib/env/server-env';

import { getCurrentUser } from '@/lib/auth';

export class AdminApiDisabledError extends Error {
  code = 'ADMIN_API_DISABLED' as const;
  constructor(message = 'Admin API is disabled by configuration') {
    super(message);
    this.name = 'AdminApiDisabledError';
  }
}

export class AdminUnauthorizedError extends Error {
  code = 'UNAUTHORIZED' as const;
  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'AdminUnauthorizedError';
  }
}

export class AdminForbiddenError extends Error {
  code = 'FORBIDDEN' as const;
  constructor(message = 'Admin role required') {
    super(message);
    this.name = 'AdminForbiddenError';
  }
}

export function assertAdminApiEnabled(): void {
  if (
    process.env.NODE_ENV === 'production' &&
    readServerEnv('ENABLE_ADMIN_API') !== 'true'
  ) {
    throw new AdminApiDisabledError();
  }
}

export async function requireAdminApi(_request?: NextRequest) {
  void _request;
  assertAdminApiEnabled();

  const user = await getCurrentUser();
  if (!user) throw new AdminUnauthorizedError();

  if (user.role !== 'admin') throw new AdminForbiddenError();

  return user;
}

export async function requireAdminPage() {
  assertAdminApiEnabled();

  const user = await getCurrentUser();
  if (!user) throw new AdminUnauthorizedError();
  if (user.role !== 'admin') throw new AdminForbiddenError();

  return user;
}
