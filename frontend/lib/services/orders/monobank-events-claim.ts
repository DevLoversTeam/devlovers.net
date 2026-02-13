import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/db';
import { logDebug, logError } from '@/lib/logging';

export type MonobankEventRow = {
  id: string;
  provider: string;
  event_key: string;
  invoice_id: string | null;
  status: string | null;
  amount: number | null;
  ccy: number | null;
  reference: string | null;
  raw_payload: Record<string, unknown> | null;
  normalized_payload: Record<string, unknown> | null;
  attempt_id: string | null;
  order_id: string | null;
  provider_modified_at: Date | string | null;
  claimed_at: Date | string | null;
  claim_expires_at: Date | string | null;
  claimed_by: string | null;
  applied_at: Date | string | null;
  applied_result: string | null;
  applied_error_code: string | null;
  applied_error_message: string | null;
  raw_sha256: string;
  received_at: Date | string;
};

function readRows<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  const anyRes = res as any;
  if (Array.isArray(anyRes?.rows)) return anyRes.rows as T[];
  return [];
}

export async function claimNextMonobankEvent(
  claimedBy: string
): Promise<MonobankEventRow | null> {
  try {
    const result = await db.execute<MonobankEventRow>(sql`
      WITH picked AS (
        SELECT id
        FROM monobank_events
        WHERE applied_at IS NULL
          AND (claim_expires_at IS NULL OR claim_expires_at < now())
        ORDER BY provider_modified_at ASC NULLS LAST, received_at ASC, id ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE monobank_events e
      SET claimed_at = now(),
          claim_expires_at = now() + interval '45 seconds',
          claimed_by = ${claimedBy}
      FROM picked
      WHERE e.id = picked.id
      RETURNING e.*
    `);

    const row = readRows<MonobankEventRow>(result)[0] ?? null;
    if (!row) {
      logDebug('monobank_event_claim_none', {
        code: 'MONO_EVENT_CLAIM_NONE',
        provider: 'monobank',
        claimedBy,
      });
      return null;
    }

    logDebug('monobank_event_claimed', {
      code: 'MONO_EVENT_CLAIMED',
      provider: 'monobank',
      eventId: row.id,
      eventKey: row.event_key,
      claimedBy,
      claimExpiresAt: row.claim_expires_at,
    });
    return row;
  } catch (error) {
    logError('monobank_event_claim_failed', error, {
      code: 'MONO_EVENT_CLAIM_FAILED',
      provider: 'monobank',
      claimedBy,
    });
    throw error;
  }
}
