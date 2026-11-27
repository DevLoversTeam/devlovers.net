import { noStoreJson } from '@/lib/http/noStoreJson';
import type { InvalidPayloadError } from '@/lib/services/errors';
import type { approveReturnRequest } from '@/lib/services/shop/returns';

type ReturnRow = Awaited<ReturnType<typeof approveReturnRequest>>['row'];
type ReturnOperation = 'transition' | 'refund';

const refundConflictCodes = new Set([
  'RETURN_REFUND_DISABLED',
  'RETURN_REFUND_STATE_INVALID',
  'RETURN_REFUND_PROVIDER_UNSUPPORTED',
  'RETURN_REFUND_PAYMENT_STATUS_INVALID',
]);

export function serializeReturnRequest(row: ReturnRow) {
  return {
    ...row,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    rejectedAt: row.rejectedAt?.toISOString() ?? null,
    receivedAt: row.receivedAt?.toISOString() ?? null,
    refundedAt: row.refundedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function invalidPayloadStatus(code: string, operation: ReturnOperation) {
  if (code === 'RETURN_NOT_FOUND') return 404;
  if (code === 'RETURN_TRANSITION_INVALID') return 409;
  if (operation === 'refund') {
    if (refundConflictCodes.has(code)) return 409;
    if (code === 'PSP_UNAVAILABLE') return 503;
  }
  return 400;
}

export function invalidReturnPayloadResponse(
  error: InvalidPayloadError,
  operation: ReturnOperation = 'transition'
) {
  return noStoreJson(
    {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    },
    { status: invalidPayloadStatus(error.code, operation) }
  );
}
