import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/db';
import { notificationOutbox } from '@/db/schema';
import { logInfo, logWarn } from '@/lib/logging';
import {
  renderShopNotificationTemplate,
  type ShopNotificationTemplateKey,
} from '@/lib/services/shop/notifications/templates';
import {
  sendShopNotificationEmail,
  ShopNotificationTransportError,
} from '@/lib/services/shop/notifications/transport';

type OutboxClaimedRow = {
  id: string;
  order_id: string;
  channel: string;
  template_key: string;
  source_domain: string;
  source_event_id: string;
  payload: unknown;
  status: string;
  attempt_count: number;
  max_attempts: number;
  dedupe_key: string;
};

type PreviewCountRow = { total: number };

type NotificationRecipientLookupRow = {
  shipping_email: string | null;
  user_email: string | null;
};

type NotificationRecipient = {
  email: string;
};

export type NotificationWorkerRunArgs = {
  runId: string;
  limit: number;
  leaseSeconds: number;
  maxAttempts: number;
  baseBackoffSeconds: number;
};

export type NotificationWorkerRunResult = {
  claimed: number;
  processed: number;
  sent: number;
  retried: number;
  deadLettered: number;
  failed: number;
};

export class NotificationSendError extends Error {
  readonly code: string;
  readonly transient: boolean;

  constructor(code: string, message: string, transient: boolean) {
    super(message);
    this.name = 'NotificationSendError';
    this.code = code;
    this.transient = transient;
  }
}

function readRows<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  const anyRes = res as { rows?: unknown };
  if (Array.isArray(anyRes?.rows)) return anyRes.rows as T[];
  return [];
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function computeBackoffSeconds(
  attemptCount: number,
  baseBackoffSeconds: number
): number {
  const cappedAttempt = Math.max(1, Math.min(attemptCount, 8));
  const exponential = Math.pow(2, cappedAttempt - 1);
  const backoff = baseBackoffSeconds * exponential;
  return Math.min(backoff, 6 * 60 * 60);
}

function readTestFailureMode(payload: unknown): {
  forceFail: boolean;
  code: string;
  transient: boolean;
  message: string;
} {
  const obj = asObject(payload);
  const testMode = asObject(obj.testMode);
  if (testMode.forceFail !== true) {
    return {
      forceFail: false,
      code: 'NONE',
      transient: false,
      message: '',
    };
  }

  const code =
    typeof testMode.code === 'string' && testMode.code.trim().length > 0
      ? testMode.code.trim()
      : 'NOTIFICATION_SEND_FAILED';
  const transient = testMode.transient !== false;
  const message =
    typeof testMode.message === 'string' && testMode.message.trim().length > 0
      ? testMode.message.trim()
      : 'Notification sending failed.';

  return { forceFail: true, code, transient, message };
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmailOrNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed === '[redacted]') return null;
  if (!EMAIL_REGEX.test(trimmed)) return null;
  return trimmed;
}

async function loadNotificationRecipient(
  orderId: string
): Promise<NotificationRecipient | null> {
  const res = await db.execute<NotificationRecipientLookupRow>(sql`
    select
      nullif(trim(os.shipping_address #>> '{recipient,email}'), '') as shipping_email,
      nullif(trim(u.email), '') as user_email
    from orders o
    left join order_shipping os on os.order_id = o.id
    left join users u on u.id = o.user_id
    where o.id = ${orderId}::uuid
    limit 1
  `);

  const row = readRows<NotificationRecipientLookupRow>(res)[0];
  if (!row) return null;

  const shippingEmail = normalizeEmailOrNull(row.shipping_email);
  if (shippingEmail) {
    return { email: shippingEmail };
  }

  const userEmail = normalizeEmailOrNull(row.user_email);
  if (userEmail) {
    return { email: userEmail };
  }

  return null;
}

function toNotificationSendError(error: unknown): NotificationSendError {
  if (error instanceof NotificationSendError) return error;

  if (error instanceof ShopNotificationTransportError) {
    return new NotificationSendError(
      error.code,
      error.message,
      error.transient
    );
  }

  return new NotificationSendError(
    'NOTIFICATION_SEND_FAILED',
    error instanceof Error ? error.message : 'Notification send failed.',
    true
  );
}

async function sendNotification(row: OutboxClaimedRow): Promise<void> {
  const failMode = readTestFailureMode(row.payload);
  if (failMode.forceFail) {
    throw new NotificationSendError(
      failMode.code,
      failMode.message,
      failMode.transient
    );
  }

  if (row.channel !== 'email') {
    throw new NotificationSendError(
      'NOTIFICATION_CHANNEL_UNSUPPORTED',
      `Unsupported notification channel: ${row.channel}`,
      false
    );
  }

  const recipient = await loadNotificationRecipient(row.order_id);
  if (!recipient) {
    throw new NotificationSendError(
      'NOTIFICATION_RECIPIENT_MISSING',
      'Notification recipient email is missing for order.',
      false
    );
  }

  const template = renderShopNotificationTemplate({
    templateKey: row.template_key as ShopNotificationTemplateKey,
    orderId: row.order_id,
    payload: asObject(row.payload),
  });

  if (!template) {
    throw new NotificationSendError(
      'NOTIFICATION_TEMPLATE_UNSUPPORTED',
      `Unsupported notification template: ${row.template_key}`,
      false
    );
  }

  const sendResult = await sendShopNotificationEmail({
    to: recipient.email,
    subject: template.subject,
    text: template.text,
    html: template.html,
  });

  logInfo('shop_notification_sent', {
    outboxId: row.id,
    orderId: row.order_id,
    channel: row.channel,
    templateKey: row.template_key,
    sourceDomain: row.source_domain,
    sourceEventId: row.source_event_id,
    messageId: sendResult.messageId,
  });
}

export async function countRunnableNotificationOutboxRows(): Promise<number> {
  const res = await db.execute<PreviewCountRow>(sql`
    select count(*)::int as total
    from notification_outbox n
    where (
      (
        n.status in ('pending', 'failed')
        and n.next_attempt_at <= now()
        and (n.lease_expires_at is null or n.lease_expires_at < now())
      )
      or (
        n.status = 'processing'
        and n.lease_expires_at < now()
      )
    )
  `);
  return Number(readRows<PreviewCountRow>(res)[0]?.total ?? 0);
}

export async function claimNotificationOutboxBatch(args: {
  runId: string;
  limit: number;
  leaseSeconds: number;
}): Promise<OutboxClaimedRow[]> {
  const res = await db.execute<OutboxClaimedRow>(sql`
    with candidates as (
      select n.id
      from notification_outbox n
      where (
        (
          n.status in ('pending', 'failed')
          and n.next_attempt_at <= now()
          and (n.lease_expires_at is null or n.lease_expires_at < now())
        )
        or (
          n.status = 'processing'
          and n.lease_expires_at < now()
        )
      )
      order by n.next_attempt_at asc, n.created_at asc
      for update skip locked
      limit ${args.limit}
    ),
    claimed as (
      update notification_outbox n
      set status = 'processing',
          lease_owner = ${args.runId},
          lease_expires_at = now() + make_interval(secs => ${args.leaseSeconds}),
          updated_at = now()
      where n.id in (select id from candidates)
      returning
        n.id,
        n.order_id,
        n.channel,
        n.template_key,
        n.source_domain,
        n.source_event_id,
        n.payload,
        n.status,
        n.attempt_count,
        n.max_attempts,
        n.dedupe_key
    )
    select * from claimed
  `);

  return readRows<OutboxClaimedRow>(res);
}

async function markSent(args: {
  outboxId: string;
  runId: string;
}): Promise<boolean> {
  const res = await db.execute<{ id: string }>(sql`
    update notification_outbox n
    set status = 'sent',
        attempt_count = n.attempt_count + 1,
        lease_owner = null,
        lease_expires_at = null,
        next_attempt_at = now(),
        last_error_code = null,
        last_error_message = null,
        sent_at = now(),
        updated_at = now()
    where n.id = ${args.outboxId}::uuid
      and n.lease_owner = ${args.runId}
    returning n.id
  `);
  return readRows<{ id: string }>(res).length > 0;
}

async function markFailedOrDeadLetter(args: {
  row: OutboxClaimedRow;
  runId: string;
  maxAttempts: number;
  baseBackoffSeconds: number;
  code: string;
  message: string;
  transient: boolean;
}): Promise<'failed' | 'dead_letter' | 'lease_lost'> {
  const attemptCount = Math.max(0, Number(args.row.attempt_count)) + 1;
  const configuredMaxAttempts = Math.max(
    1,
    Math.min(
      args.maxAttempts,
      Number(args.row.max_attempts) || args.maxAttempts
    )
  );

  const toDeadLetter = !args.transient || attemptCount >= configuredMaxAttempts;
  const nextAttemptAt = new Date(
    Date.now() +
      computeBackoffSeconds(attemptCount, args.baseBackoffSeconds) * 1000
  );

  const res = await db.execute<{ id: string }>(sql`
  update notification_outbox n
  set status = ${toDeadLetter ? 'dead_letter' : 'failed'},
      attempt_count = n.attempt_count + 1,
      lease_owner = null,
      lease_expires_at = null,
      next_attempt_at = case
        when ${toDeadLetter}::boolean then now()
        else ${nextAttemptAt}
      end,
      last_error_code = ${args.code},
      last_error_message = ${args.message},
      dead_lettered_at = case
        when ${toDeadLetter}::boolean then now()
        else n.dead_lettered_at
      end,
      updated_at = now()
  where n.id = ${args.row.id}::uuid
    and n.lease_owner = ${args.runId}
  returning n.id
`);

  if (readRows<{ id: string }>(res).length === 0) return 'lease_lost';
  return toDeadLetter ? 'dead_letter' : 'failed';
}

export async function runNotificationOutboxWorker(
  args: NotificationWorkerRunArgs
): Promise<NotificationWorkerRunResult> {
  const claimed = await claimNotificationOutboxBatch({
    runId: args.runId,
    limit: args.limit,
    leaseSeconds: args.leaseSeconds,
  });

  let processed = 0;
  let sent = 0;
  let retried = 0;
  let deadLettered = 0;
  let failed = 0;

  for (const row of claimed) {
    processed += 1;

    try {
      await sendNotification(row);

      const updated = await markSent({
        outboxId: row.id,
        runId: args.runId,
      });
      if (!updated) {
        failed += 1;
      } else {
        sent += 1;
      }
      continue;
    } catch (error) {
      const sendError = toNotificationSendError(error);

      const transition = await markFailedOrDeadLetter({
        row,
        runId: args.runId,
        maxAttempts: args.maxAttempts,
        baseBackoffSeconds: args.baseBackoffSeconds,
        code: sendError.code,
        message: sendError.message,
        transient: sendError.transient,
      });

      if (transition === 'dead_letter') {
        deadLettered += 1;
      } else if (transition === 'failed') {
        retried += 1;
      } else {
        failed += 1;
      }

      logWarn('shop_notification_send_failed', {
        outboxId: row.id,
        orderId: row.order_id,
        templateKey: row.template_key,
        code: sendError.code,
        transient: sendError.transient,
        transition,
      });
    }
  }

  return {
    claimed: claimed.length,
    processed,
    sent,
    retried,
    deadLettered,
    failed,
  };
}
