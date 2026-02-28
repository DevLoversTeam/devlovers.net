import 'server-only';

import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { orders } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth';
import {
  hasStatusTokenScope,
  type StatusTokenScope,
  verifyStatusToken,
} from '@/lib/shop/status-token';

export type OrderAccessResult = {
  authorized: boolean;
  actorUserId: string | null;
  code:
    | 'OK'
    | 'ORDER_NOT_FOUND'
    | 'UNAUTHORIZED'
    | 'FORBIDDEN'
    | 'STATUS_TOKEN_REQUIRED'
    | 'STATUS_TOKEN_INVALID'
    | 'STATUS_TOKEN_SCOPE_FORBIDDEN'
    | 'STATUS_TOKEN_MISCONFIGURED';
  status: number;
};

export async function authorizeOrderMutationAccess(args: {
  orderId: string;
  statusToken: string | null;
  requiredScope: StatusTokenScope;
}): Promise<OrderAccessResult> {
  const [exists] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.id, args.orderId))
    .limit(1);

  if (!exists) {
    return {
      authorized: false,
      actorUserId: null,
      code: 'ORDER_NOT_FOUND',
      status: 404,
    };
  }

  const user = await getCurrentUser();
  if (user) {
    if (user.role === 'admin') {
      return {
        authorized: true,
        actorUserId: user.id,
        code: 'OK',
        status: 200,
      };
    }

    const [owned] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.id, args.orderId), eq(orders.userId, user.id)))
      .limit(1);
    if (owned) {
      return {
        authorized: true,
        actorUserId: user.id,
        code: 'OK',
        status: 200,
      };
    }
  }

  if (!args.statusToken || !args.statusToken.trim()) {
    return {
      authorized: false,
      actorUserId: null,
      code: user ? 'FORBIDDEN' : 'STATUS_TOKEN_REQUIRED',
      status: user ? 403 : 401,
    };
  }

  const tokenRes = verifyStatusToken({
    token: args.statusToken.trim(),
    orderId: args.orderId,
  });
  if (!tokenRes.ok) {
    if (tokenRes.reason === 'missing_secret') {
      return {
        authorized: false,
        actorUserId: null,
        code: 'STATUS_TOKEN_MISCONFIGURED',
        status: 500,
      };
    }

    return {
      authorized: false,
      actorUserId: null,
      code: 'STATUS_TOKEN_INVALID',
      status: 403,
    };
  }

  if (!hasStatusTokenScope(tokenRes.payload, args.requiredScope)) {
    return {
      authorized: false,
      actorUserId: null,
      code: 'STATUS_TOKEN_SCOPE_FORBIDDEN',
      status: 403,
    };
  }

  return {
    authorized: true,
    actorUserId: null,
    code: 'OK',
    status: 200,
  };
}
