import { type SQL, sql } from 'drizzle-orm';

export function insertPaymentEventFromUpdatedOrderSql(args: {
  provider: SQL;
  eventName: SQL;
  eventSource: SQL;
  eventRef: string;
  attemptId?: string;
  providerPaymentIntentId: string | null;
  providerChargeId?: string | null;
  payload: Record<string, unknown>;
  dedupeKey: string;
  now: Date;
  dualWriteEnabled?: boolean;
}): SQL {
  const attemptIdSql =
    args.attemptId === undefined ? sql`null` : sql`${args.attemptId}::uuid`;
  const chargeIdSql =
    args.providerChargeId === undefined
      ? sql`null`
      : sql`${args.providerChargeId}`;
  const enabledFilter =
    args.dualWriteEnabled === undefined
      ? sql``
      : sql`where ${args.dualWriteEnabled} = true`;

  return sql`
    insert into payment_events (
      order_id,
      provider,
      event_name,
      event_source,
      event_ref,
      attempt_id,
      provider_payment_intent_id,
      provider_charge_id,
      amount_minor,
      currency,
      payload,
      dedupe_key,
      occurred_at,
      created_at
    )
    select
      uo.id,
      ${args.provider},
      ${args.eventName},
      ${args.eventSource},
      ${args.eventRef},
      ${attemptIdSql},
      ${args.providerPaymentIntentId},
      ${chargeIdSql},
      uo.total_amount_minor::bigint,
      uo.currency,
      ${JSON.stringify(args.payload)}::jsonb,
      ${args.dedupeKey},
      ${args.now},
      ${args.now}
    from updated_order uo
    ${enabledFilter}
    on conflict (dedupe_key) do nothing
    returning id
  `;
}
