import { sql } from 'drizzle-orm';

import { db } from '@/db';
import { readDbRows } from '@/db/readDbRows';
import { noStoreJson } from '@/lib/http/noStoreJson';

type GateRow = { next_allowed_at: unknown };

function normalizeDate(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function acquireShippingJobSlot({
  jobName,
  minIntervalSeconds,
  runId,
}: {
  jobName: string;
  minIntervalSeconds: number;
  runId: string;
}) {
  const result = await db.execute<GateRow>(sql`
    INSERT INTO internal_job_state (job_name, next_allowed_at, last_run_id, updated_at)
    VALUES (
      ${jobName},
      now() + make_interval(secs => ${minIntervalSeconds}),
      ${runId}::uuid,
      now()
    )
    ON CONFLICT (job_name) DO UPDATE
      SET next_allowed_at = now() + make_interval(secs => ${minIntervalSeconds}),
          last_run_id = ${runId}::uuid,
          updated_at = now()
      WHERE internal_job_state.next_allowed_at <= now()
    RETURNING next_allowed_at
  `);

  if (readDbRows<GateRow>(result).length > 0) return { ok: true as const };

  const fallback = await db.execute<GateRow>(sql`
    SELECT next_allowed_at
    FROM internal_job_state
    WHERE job_name = ${jobName}
    LIMIT 1
  `);
  const nextAllowedAt = normalizeDate(
    readDbRows<GateRow>(fallback)[0]?.next_allowed_at
  );
  return { ok: false as const, nextAllowedAt };
}

export function shippingJobRateLimitedResponse(
  nextAllowedAt: Date | null,
  requestId: string
) {
  const wait = nextAllowedAt
    ? Math.max(1, Math.ceil((nextAllowedAt.getTime() - Date.now()) / 1000))
    : 1;

  const response = noStoreJson(
    { success: false, code: 'RATE_LIMITED', retryAfterSeconds: wait },
    { status: 429 }
  );
  response.headers.set('X-Request-Id', requestId);
  response.headers.set('Retry-After', String(wait));
  return response;
}
