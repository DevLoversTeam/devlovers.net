import 'server-only';

import { and, asc, desc, eq, lte } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

import { db } from '@/db';
import { orderItems, orders, shippingQuotes } from '@/db/schema';
import { isCanonicalEventsDualWriteEnabled } from '@/lib/env/shop-canonical-events';
import {
  getIntlAcceptedPaymentTtlMinutes,
  getIntlQuoteOfferTtlMinutes,
} from '@/lib/env/shop-intl';
import { applyReleaseMove, applyReserveMove } from '@/lib/services/inventory';
import { aggregateReserveByProductId } from '@/lib/services/orders/_shared';
import { restockOrder } from '@/lib/services/orders';
import { buildShippingEventDedupeKey } from '@/lib/services/shop/events/dedupe-key';
import {
  isOrderQuoteStatusTransitionAllowed,
  orderQuoteTransitionWhereSql,
  type OrderQuoteStatus,
} from '@/lib/services/shop/transitions/order-state';
import { InvalidPayloadError, OrderNotFoundError } from '@/lib/services/errors';

type QuoteStatus = OrderQuoteStatus;

type FulfillmentMode = 'ua_np' | 'intl';

type OrderQuoteRow = {
  id: string;
  currency: 'USD' | 'UAH';
  paymentProvider: string;
  paymentStatus: string;
  fulfillmentMode: FulfillmentMode;
  quoteStatus: QuoteStatus;
  quoteVersion: number | null;
  shippingQuoteMinor: number | null;
  itemsSubtotalMinor: number;
  totalAmountMinor: number;
  inventoryStatus: string;
  quotePaymentDeadlineAt: Date | null;
};

type QuoteRow = {
  id: string;
  orderId: string;
  version: number;
  status: QuoteStatus;
  currency: 'USD' | 'UAH';
  shippingQuoteMinor: number;
  expiresAt: Date;
};

function parseDateOrNull(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function quoteError(
  code:
    | 'INVALID_PAYLOAD'
    | 'QUOTE_NOT_APPLICABLE'
    | 'QUOTE_VERSION_CONFLICT'
    | 'QUOTE_CURRENCY_MISMATCH'
    | 'QUOTE_EXPIRED'
    | 'QUOTE_NOT_OFFERED'
    | 'QUOTE_ALREADY_ACCEPTED'
    | 'QUOTE_STOCK_UNAVAILABLE'
    | 'QUOTE_NOT_ACCEPTED'
    | 'QUOTE_PAYMENT_WINDOW_EXPIRED'
    | 'QUOTE_INVENTORY_NOT_RESERVED'
    | 'PAYMENT_PROVIDER_NOT_ALLOWED_FOR_INTL'
    | 'QUOTE_INVALID_EXPIRY',
  message: string,
  details?: Record<string, unknown>
): InvalidPayloadError {
  return new InvalidPayloadError(message, { code, details });
}

function canonicalFlag(): boolean {
  return isCanonicalEventsDualWriteEnabled();
}

function makeQuoteEventDedupeKey(seed: Record<string, unknown>): string {
  return buildShippingEventDedupeKey({
    domain: 'intl_quote',
    ...seed,
  });
}

async function loadOrderQuote(orderId: string): Promise<OrderQuoteRow> {
  const [row] = await db
    .select({
      id: orders.id,
      currency: orders.currency,
      paymentProvider: orders.paymentProvider,
      paymentStatus: orders.paymentStatus,
      fulfillmentMode: orders.fulfillmentMode,
      quoteStatus: orders.quoteStatus,
      quoteVersion: orders.quoteVersion,
      shippingQuoteMinor: orders.shippingQuoteMinor,
      itemsSubtotalMinor: orders.itemsSubtotalMinor,
      totalAmountMinor: orders.totalAmountMinor,
      inventoryStatus: orders.inventoryStatus,
      quotePaymentDeadlineAt: orders.quotePaymentDeadlineAt,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!row) throw new OrderNotFoundError('Order not found.');

  return {
    id: String(row.id),
    currency: row.currency as 'USD' | 'UAH',
    paymentProvider: String(row.paymentProvider),
    paymentStatus: String(row.paymentStatus),
    fulfillmentMode: row.fulfillmentMode as FulfillmentMode,
    quoteStatus: row.quoteStatus as QuoteStatus,
    quoteVersion:
      typeof row.quoteVersion === 'number' ? row.quoteVersion : null,
    shippingQuoteMinor:
      typeof row.shippingQuoteMinor === 'number'
        ? row.shippingQuoteMinor
        : null,
    itemsSubtotalMinor:
      typeof row.itemsSubtotalMinor === 'number' ? row.itemsSubtotalMinor : 0,
    totalAmountMinor:
      typeof row.totalAmountMinor === 'number' ? row.totalAmountMinor : 0,
    inventoryStatus: String(row.inventoryStatus),
    quotePaymentDeadlineAt: parseDateOrNull(row.quotePaymentDeadlineAt),
  };
}

function assertIntlOrder(order: OrderQuoteRow): void {
  if (order.fulfillmentMode !== 'intl') {
    throw quoteError(
      'QUOTE_NOT_APPLICABLE',
      'Quote workflow is available only for international orders.'
    );
  }
}

async function loadQuoteByVersion(
  orderId: string,
  version: number
): Promise<QuoteRow | null> {
  const [row] = await db
    .select({
      id: shippingQuotes.id,
      orderId: shippingQuotes.orderId,
      version: shippingQuotes.version,
      status: shippingQuotes.status,
      currency: shippingQuotes.currency,
      shippingQuoteMinor: shippingQuotes.shippingQuoteMinor,
      expiresAt: shippingQuotes.expiresAt,
    })
    .from(shippingQuotes)
    .where(
      and(
        eq(shippingQuotes.orderId, orderId),
        eq(shippingQuotes.version, version)
      )
    )
    .limit(1);

  if (!row) return null;

  const expiresAt = parseDateOrNull(row.expiresAt);
  if (!expiresAt) {
    throw quoteError('INVALID_PAYLOAD', 'Stored quote expiry is invalid.', {
      orderId,
      version,
    });
  }

  return {
    id: String(row.id),
    orderId: String(row.orderId),
    version: Number(row.version),
    status: row.status as QuoteStatus,
    currency: row.currency as 'USD' | 'UAH',
    shippingQuoteMinor: Number(row.shippingQuoteMinor),
    expiresAt,
  };
}

async function loadLatestQuote(
  orderId: string
): Promise<Pick<QuoteRow, 'version' | 'status'> | null> {
  const [row] = await db
    .select({
      version: shippingQuotes.version,
      status: shippingQuotes.status,
    })
    .from(shippingQuotes)
    .where(eq(shippingQuotes.orderId, orderId))
    .orderBy(desc(shippingQuotes.version))
    .limit(1);

  if (!row) return null;
  return {
    version: Number(row.version),
    status: row.status as QuoteStatus,
  };
}

async function atomicExpireQuote(args: {
  orderId: string;
  version: number;
  now: Date;
  eventSource: string;
  eventRef: string;
  reason: string;
}): Promise<boolean> {
  const dedupeKey = makeQuoteEventDedupeKey({
    action: 'quote_expired',
    orderId: args.orderId,
    version: args.version,
    eventRef: args.eventRef,
    reason: args.reason,
  });

  const res = await db.execute(sql`
    with updated_quote as (
      update shipping_quotes q
      set status = 'expired',
          updated_at = ${args.now}
      where q.order_id = ${args.orderId}::uuid
        and q.version = ${args.version}
        and q.status = 'offered'
      returning q.order_id, q.version
    ),
    updated_order as (
      update orders o
      set quote_status = 'expired',
          quote_payment_deadline_at = null,
          quote_accepted_at = null,
          updated_at = ${args.now}
      where o.id in (select order_id from updated_quote)
        and o.fulfillment_mode = 'intl'
        and o.quote_version = ${args.version}
        and ${orderQuoteTransitionWhereSql({
          column: sql`o.quote_status`,
          to: 'expired',
        })}
      returning o.id
    ),
    inserted_event as (
      insert into shipping_events (
        order_id,
        shipment_id,
        provider,
        event_name,
        event_source,
        event_ref,
        status_from,
        status_to,
        tracking_number,
        payload,
        dedupe_key,
        occurred_at,
        created_at
      )
      select
        uo.id,
        null,
        'intl_quote',
        'quote_expired',
        ${args.eventSource},
        ${args.eventRef},
        'offered',
        'expired',
        null,
        ${JSON.stringify({
          version: args.version,
          reason: args.reason,
        })}::jsonb,
        ${dedupeKey},
        ${args.now},
        ${args.now}
      from updated_order uo
      where ${canonicalFlag()} = true
      on conflict (dedupe_key) do nothing
      returning id
    )
    select
      (select count(*)::int from updated_quote) as updated_quote_count
  `);

  const row = (res as any)?.rows?.[0];
  return Number(row?.updated_quote_count ?? 0) > 0;
}

export async function requestIntlQuote(args: {
  orderId: string;
  requestId: string;
  actorUserId: string | null;
}) {
  const now = new Date();
  const order = await loadOrderQuote(args.orderId);
  assertIntlOrder(order);

  if (order.quoteStatus === 'accepted') {
    throw quoteError(
      'QUOTE_ALREADY_ACCEPTED',
      'Quote is already accepted and awaiting payment.'
    );
  }

  if (order.quoteStatus === 'offered') {
    throw quoteError(
      'QUOTE_NOT_OFFERED',
      'Quote is already offered. Accept or decline the current quote first.'
    );
  }

  if (order.quoteStatus === 'requested') {
    return {
      orderId: order.id,
      quoteStatus: order.quoteStatus,
      changed: false,
    };
  }

  if (!isOrderQuoteStatusTransitionAllowed(order.quoteStatus, 'requested')) {
    throw quoteError(
      'QUOTE_NOT_APPLICABLE',
      `Invalid quote transition from ${order.quoteStatus} to requested.`,
      { statusFrom: order.quoteStatus, statusTo: 'requested' }
    );
  }

  const dedupeKey = makeQuoteEventDedupeKey({
    action: 'quote_requested',
    orderId: order.id,
    eventRef: args.requestId,
    from: order.quoteStatus,
    to: 'requested',
  });

  const res = await db.execute(sql`
    with updated_order as (
      update orders o
      set quote_status = 'requested',
          quote_accepted_at = null,
          quote_payment_deadline_at = null,
          updated_at = ${now}
      where o.id = ${order.id}::uuid
        and o.fulfillment_mode = 'intl'
        and ${orderQuoteTransitionWhereSql({
          column: sql`o.quote_status`,
          to: 'requested',
        })}
      returning o.id
    ),
    inserted_event as (
      insert into shipping_events (
        order_id,
        shipment_id,
        provider,
        event_name,
        event_source,
        event_ref,
        status_from,
        status_to,
        tracking_number,
        payload,
        dedupe_key,
        occurred_at,
        created_at
      )
      select
        uo.id,
        null,
        'intl_quote',
        'quote_requested',
        'quote_request_route',
        ${args.requestId},
        ${order.quoteStatus},
        'requested',
        null,
        ${JSON.stringify({
          actorUserId: args.actorUserId,
        })}::jsonb,
        ${dedupeKey},
        ${now},
        ${now}
      from updated_order uo
      where ${canonicalFlag()} = true
      on conflict (dedupe_key) do nothing
      returning id
    )
    select (select count(*)::int from updated_order) as updated_order_count
  `);

  const updated = Number((res as any)?.rows?.[0]?.updated_order_count ?? 0) > 0;
  return {
    orderId: order.id,
    quoteStatus: updated ? ('requested' as const) : order.quoteStatus,
    changed: updated,
  };
}

export async function offerIntlQuote(args: {
  orderId: string;
  requestId: string;
  actorUserId: string | null;
  version: number;
  currency: 'USD' | 'UAH';
  shippingQuoteMinor: number;
  expiresAt?: Date | null;
  payload?: Record<string, unknown>;
}) {
  const now = new Date();
  const order = await loadOrderQuote(args.orderId);
  assertIntlOrder(order);

  if (order.quoteStatus === 'accepted') {
    throw quoteError(
      'QUOTE_ALREADY_ACCEPTED',
      'Accepted quote cannot be replaced.'
    );
  }

  if (order.quoteStatus === 'offered') {
    throw quoteError(
      'QUOTE_VERSION_CONFLICT',
      'Current quote must be accepted, declined, or expired before offering a new version.'
    );
  }

  if (!isOrderQuoteStatusTransitionAllowed(order.quoteStatus, 'offered')) {
    throw quoteError(
      'QUOTE_NOT_APPLICABLE',
      `Invalid quote transition from ${order.quoteStatus} to offered.`,
      { statusFrom: order.quoteStatus, statusTo: 'offered' }
    );
  }

  if (args.currency !== order.currency) {
    throw quoteError(
      'QUOTE_CURRENCY_MISMATCH',
      'Quote currency must match order currency.'
    );
  }

  const latestQuote = await loadLatestQuote(order.id);
  const expectedVersion = (latestQuote?.version ?? 0) + 1;
  if (args.version !== expectedVersion) {
    throw quoteError('QUOTE_VERSION_CONFLICT', 'Quote version conflict.', {
      expectedVersion,
      gotVersion: args.version,
    });
  }

  if (
    !Number.isInteger(args.shippingQuoteMinor) ||
    args.shippingQuoteMinor < 0
  ) {
    throw quoteError(
      'INVALID_PAYLOAD',
      'shippingQuoteMinor must be a non-negative integer.'
    );
  }

  const expiresAt =
    args.expiresAt ??
    new Date(now.getTime() + getIntlQuoteOfferTtlMinutes() * 60 * 1000);
  if (expiresAt.getTime() <= now.getTime()) {
    throw quoteError(
      'QUOTE_INVALID_EXPIRY',
      'Quote expiry must be in the future.'
    );
  }

  const dedupeKey = makeQuoteEventDedupeKey({
    action: 'quote_offered',
    orderId: order.id,
    version: args.version,
    eventRef: args.requestId,
  });

  const res = await db.execute(sql`
    with inserted_quote as (
      insert into shipping_quotes (
        order_id,
        version,
        status,
        currency,
        shipping_quote_minor,
        offered_by,
        offered_at,
        expires_at,
        payload,
        created_at,
        updated_at
      )
      values (
        ${order.id}::uuid,
        ${args.version},
        'offered',
        ${args.currency},
        ${args.shippingQuoteMinor},
        ${args.actorUserId},
        ${now},
        ${expiresAt},
        ${JSON.stringify(args.payload ?? {})}::jsonb,
        ${now},
        ${now}
      )
      on conflict (order_id, version) do nothing
      returning order_id, version, shipping_quote_minor
    ),
    updated_order as (
      update orders o
      set quote_status = 'offered',
          quote_version = iq.version,
          shipping_quote_minor = iq.shipping_quote_minor,
          quote_accepted_at = null,
          quote_payment_deadline_at = null,
          items_subtotal_minor = case
            when o.items_subtotal_minor > 0 then o.items_subtotal_minor
            else o.total_amount_minor
          end,
          total_amount_minor = (
            case
              when o.items_subtotal_minor > 0 then o.items_subtotal_minor
              else o.total_amount_minor
            end
          ) + iq.shipping_quote_minor,
          total_amount = ((
            (
              case
                when o.items_subtotal_minor > 0 then o.items_subtotal_minor
                else o.total_amount_minor
              end
            ) + iq.shipping_quote_minor
          )::numeric / 100),
          updated_at = ${now}
      from inserted_quote iq
      where o.id = iq.order_id
      returning o.id
    ),
    inserted_event as (
      insert into shipping_events (
        order_id,
        shipment_id,
        provider,
        event_name,
        event_source,
        event_ref,
        status_from,
        status_to,
        tracking_number,
        payload,
        dedupe_key,
        occurred_at,
        created_at
      )
      select
        uo.id,
        null,
        'intl_quote',
        'quote_offered',
        'admin_quote_offer_route',
        ${args.requestId},
        ${order.quoteStatus},
        'offered',
        null,
        ${JSON.stringify({
          version: args.version,
          shippingQuoteMinor: args.shippingQuoteMinor,
          expiresAt: expiresAt.toISOString(),
          actorUserId: args.actorUserId,
        })}::jsonb,
        ${dedupeKey},
        ${now},
        ${now}
      from updated_order uo
      where ${canonicalFlag()} = true
      on conflict (dedupe_key) do nothing
      returning id
    )
    select
      (select count(*)::int from inserted_quote) as inserted_quote_count,
      (select count(*)::int from updated_order) as updated_order_count
  `);

  const row = (res as any)?.rows?.[0];
  const insertedCount = Number(row?.inserted_quote_count ?? 0);
  if (insertedCount === 0) {
    throw quoteError(
      'QUOTE_VERSION_CONFLICT',
      'Quote version already exists.',
      {
        version: args.version,
      }
    );
  }

  return {
    orderId: order.id,
    version: args.version,
    quoteStatus: 'offered' as const,
    shippingQuoteMinor: args.shippingQuoteMinor,
    currency: args.currency,
    expiresAt,
  };
}

export async function acceptIntlQuote(args: {
  orderId: string;
  requestId: string;
  actorUserId: string | null;
  version: number;
}) {
  const now = new Date();
  const order = await loadOrderQuote(args.orderId);
  assertIntlOrder(order);

  const quote = await loadQuoteByVersion(order.id, args.version);
  if (!quote) {
    throw quoteError('QUOTE_VERSION_CONFLICT', 'Quote version not found.');
  }

  const latestQuote = await loadLatestQuote(order.id);
  if (latestQuote && latestQuote.version !== args.version) {
    throw quoteError('QUOTE_VERSION_CONFLICT', 'Quote version conflict.', {
      currentVersion: latestQuote.version,
      requestedVersion: args.version,
    });
  }

  if (quote.currency !== order.currency) {
    throw quoteError(
      'QUOTE_CURRENCY_MISMATCH',
      'Quote currency must match order currency.'
    );
  }

  if (quote.status === 'accepted') {
    return {
      orderId: order.id,
      version: quote.version,
      quoteStatus: quote.status,
      changed: false,
      paymentDeadlineAt: order.quotePaymentDeadlineAt,
    };
  }

  if (quote.status !== 'offered') {
    if (quote.status === 'expired') {
      throw quoteError('QUOTE_EXPIRED', 'Quote has expired.');
    }
    throw quoteError('QUOTE_NOT_OFFERED', 'Quote is not in offered state.');
  }

  if (!isOrderQuoteStatusTransitionAllowed(quote.status, 'accepted')) {
    throw quoteError(
      'QUOTE_NOT_OFFERED',
      `Invalid quote transition from ${quote.status} to accepted.`,
      { statusFrom: quote.status, statusTo: 'accepted' }
    );
  }

  if (quote.expiresAt.getTime() <= now.getTime()) {
    await atomicExpireQuote({
      orderId: order.id,
      version: quote.version,
      now,
      eventSource: 'quote_accept_route',
      eventRef: args.requestId,
      reason: 'accept_after_expiry',
    });
    throw quoteError('QUOTE_EXPIRED', 'Quote has expired.');
  }

  const orderLineItems = await db
    .select({
      productId: orderItems.productId,
      quantity: orderItems.quantity,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id));

  if (orderLineItems.length === 0) {
    throw quoteError('INVALID_PAYLOAD', 'Order has no line items.');
  }

  const reserves = aggregateReserveByProductId(orderLineItems);
  const reservedApplied: Array<{ productId: string; quantity: number }> = [];
  let stockFailureProductId: string | null = null;
  const releaseReservedApplied = async () => {
    for (const reserved of reservedApplied) {
      await applyReleaseMove(order.id, reserved.productId, reserved.quantity);
    }
  };

  for (const move of reserves) {
    const reserve = await applyReserveMove(
      order.id,
      move.productId,
      move.quantity
    );
    if (!reserve.ok) {
      stockFailureProductId = move.productId;
      break;
    }
    if (reserve.applied) {
      reservedApplied.push(move);
    }
  }

  if (stockFailureProductId) {
    await releaseReservedApplied();

    const dedupeKey = makeQuoteEventDedupeKey({
      action: 'quote_requires_requote',
      orderId: order.id,
      version: quote.version,
      eventRef: args.requestId,
      reason: 'stock_unavailable',
    });

    await db.execute(sql`
      with updated_quote as (
        update shipping_quotes q
        set status = 'requires_requote',
            updated_at = ${now}
        where q.order_id = ${order.id}::uuid
          and q.version = ${quote.version}
          and q.status = 'offered'
        returning q.order_id, q.version
      ),
      updated_order as (
        update orders o
        set quote_status = 'requires_requote',
            quote_payment_deadline_at = null,
            quote_accepted_at = null,
            inventory_status = 'failed',
            failure_code = 'QUOTE_STOCK_UNAVAILABLE',
            failure_message = 'Stock became unavailable for quote acceptance.',
            updated_at = ${now}
        where o.id in (select order_id from updated_quote)
          and o.fulfillment_mode = 'intl'
          and ${orderQuoteTransitionWhereSql({
            column: sql`o.quote_status`,
            to: 'requires_requote',
          })}
        returning o.id
      ),
      inserted_event as (
        insert into shipping_events (
          order_id,
          shipment_id,
          provider,
          event_name,
          event_source,
          event_ref,
          status_from,
          status_to,
          tracking_number,
          payload,
          dedupe_key,
          occurred_at,
          created_at
        )
        select
          uo.id,
          null,
          'intl_quote',
          'quote_requires_requote',
          'quote_accept_route',
          ${args.requestId},
          'offered',
          'requires_requote',
          null,
          ${JSON.stringify({
            version: quote.version,
            actorUserId: args.actorUserId,
            productId: stockFailureProductId,
            reason: 'stock_unavailable',
          })}::jsonb,
          ${dedupeKey},
          ${now},
          ${now}
        from updated_order uo
        where ${canonicalFlag()} = true
        on conflict (dedupe_key) do nothing
        returning id
      )
      select (select count(*)::int from updated_order) as updated_order_count
    `);

    throw quoteError(
      'QUOTE_STOCK_UNAVAILABLE',
      'Quote cannot be accepted because stock is unavailable.',
      { productId: stockFailureProductId }
    );
  }

  const paymentDeadlineAt = new Date(
    now.getTime() + getIntlAcceptedPaymentTtlMinutes() * 60 * 1000
  );
  const dedupeKey = makeQuoteEventDedupeKey({
    action: 'quote_accepted',
    orderId: order.id,
    version: quote.version,
    eventRef: args.requestId,
  });

  let res: unknown;
  try {
    res = await db.execute(sql`
      with updated_quote as (
        update shipping_quotes q
        set status = 'accepted',
            accepted_at = ${now},
            updated_at = ${now}
        where q.order_id = ${order.id}::uuid
          and q.version = ${quote.version}
          and q.status = 'offered'
          and q.expires_at > ${now}
        returning q.order_id, q.version, q.shipping_quote_minor
      ),
      updated_order as (
        update orders o
        set quote_status = 'accepted',
            quote_version = uq.version,
            shipping_quote_minor = uq.shipping_quote_minor,
            quote_accepted_at = ${now},
            quote_payment_deadline_at = ${paymentDeadlineAt},
            inventory_status = 'reserved',
            failure_code = null,
            failure_message = null,
            payment_provider = case
              when o.payment_provider = 'none' then 'stripe'
              else o.payment_provider
            end,
            items_subtotal_minor = case
              when o.items_subtotal_minor > 0 then o.items_subtotal_minor
              else o.total_amount_minor
            end,
            total_amount_minor = (
              case
                when o.items_subtotal_minor > 0 then o.items_subtotal_minor
                else o.total_amount_minor
              end
            ) + uq.shipping_quote_minor,
            total_amount = ((
              (
                case
                  when o.items_subtotal_minor > 0 then o.items_subtotal_minor
                  else o.total_amount_minor
                end
              ) + uq.shipping_quote_minor
            )::numeric / 100),
            updated_at = ${now}
        from updated_quote uq
        where o.id = uq.order_id
          and o.fulfillment_mode = 'intl'
          and ${orderQuoteTransitionWhereSql({
            column: sql`o.quote_status`,
            to: 'accepted',
          })}
        returning o.id, o.total_amount_minor, o.currency, o.quote_payment_deadline_at
      ),
      inserted_event as (
        insert into shipping_events (
          order_id,
          shipment_id,
          provider,
          event_name,
          event_source,
          event_ref,
          status_from,
          status_to,
          tracking_number,
          payload,
          dedupe_key,
          occurred_at,
          created_at
        )
        select
          uo.id,
          null,
          'intl_quote',
          'quote_accepted',
          'quote_accept_route',
          ${args.requestId},
          'offered',
          'accepted',
          null,
          ${JSON.stringify({
            version: quote.version,
            actorUserId: args.actorUserId,
            paymentDeadlineAt: paymentDeadlineAt.toISOString(),
          })}::jsonb,
          ${dedupeKey},
          ${now},
          ${now}
        from updated_order uo
        where ${canonicalFlag()} = true
        on conflict (dedupe_key) do nothing
        returning id
      )
      select
        (select count(*)::int from updated_quote) as updated_quote_count,
        (select total_amount_minor from updated_order limit 1) as total_amount_minor
    `);
  } catch (error) {
    await releaseReservedApplied();
    throw error;
  }

  const row = (res as any)?.rows?.[0];
  if (Number(row?.updated_quote_count ?? 0) === 0) {
    await releaseReservedApplied();
    throw quoteError('QUOTE_VERSION_CONFLICT', 'Quote is no longer offerable.');
  }

  return {
    orderId: order.id,
    version: quote.version,
    quoteStatus: 'accepted' as const,
    changed: true,
    paymentDeadlineAt,
    totalAmountMinor: Number(row?.total_amount_minor ?? 0),
  };
}

export async function declineIntlQuote(args: {
  orderId: string;
  requestId: string;
  actorUserId: string | null;
  version?: number | null;
}) {
  const now = new Date();
  const order = await loadOrderQuote(args.orderId);
  assertIntlOrder(order);

  if (order.quoteStatus === 'accepted') {
    throw quoteError(
      'QUOTE_ALREADY_ACCEPTED',
      'Accepted quote cannot be declined.'
    );
  }

  const latestQuote = await loadLatestQuote(order.id);
  if (!latestQuote) {
    throw quoteError('QUOTE_NOT_OFFERED', 'No offered quote to decline.');
  }

  const version = args.version ?? latestQuote.version;
  if (version !== latestQuote.version) {
    throw quoteError('QUOTE_VERSION_CONFLICT', 'Quote version conflict.', {
      currentVersion: latestQuote.version,
      requestedVersion: version,
    });
  }

  if (latestQuote.status === 'declined') {
    return {
      orderId: order.id,
      quoteStatus: 'declined' as const,
      changed: false,
    };
  }

  if (latestQuote.status !== 'offered') {
    if (latestQuote.status === 'expired') {
      throw quoteError('QUOTE_EXPIRED', 'Quote has expired.');
    }
    throw quoteError('QUOTE_NOT_OFFERED', 'No offered quote to decline.');
  }

  if (!isOrderQuoteStatusTransitionAllowed(latestQuote.status, 'declined')) {
    throw quoteError(
      'QUOTE_NOT_OFFERED',
      `Invalid quote transition from ${latestQuote.status} to declined.`,
      { statusFrom: latestQuote.status, statusTo: 'declined' }
    );
  }

  const dedupeKey = makeQuoteEventDedupeKey({
    action: 'quote_declined',
    orderId: order.id,
    version,
    eventRef: args.requestId,
  });

  const res = await db.execute(sql`
    with updated_quote as (
      update shipping_quotes q
      set status = 'declined',
          declined_at = ${now},
          updated_at = ${now}
      where q.order_id = ${order.id}::uuid
        and q.version = ${version}
        and q.status = 'offered'
      returning q.order_id
    ),
    updated_order as (
      update orders o
      set quote_status = 'declined',
          quote_accepted_at = null,
          quote_payment_deadline_at = null,
          updated_at = ${now}
      where o.id in (select order_id from updated_quote)
        and o.fulfillment_mode = 'intl'
        and o.quote_version = ${version}
        and ${orderQuoteTransitionWhereSql({
          column: sql`o.quote_status`,
          to: 'declined',
        })}
      returning o.id
    ),
    inserted_event as (
      insert into shipping_events (
        order_id,
        shipment_id,
        provider,
        event_name,
        event_source,
        event_ref,
        status_from,
        status_to,
        tracking_number,
        payload,
        dedupe_key,
        occurred_at,
        created_at
      )
      select
        uo.id,
        null,
        'intl_quote',
        'quote_declined',
        'quote_decline_route',
        ${args.requestId},
        'offered',
        'declined',
        null,
        ${JSON.stringify({
          version,
          actorUserId: args.actorUserId,
        })}::jsonb,
        ${dedupeKey},
        ${now},
        ${now}
      from updated_order uo
      where ${canonicalFlag()} = true
      on conflict (dedupe_key) do nothing
      returning id
    )
    select (select count(*)::int from updated_quote) as updated_quote_count
  `);

  if (Number((res as any)?.rows?.[0]?.updated_quote_count ?? 0) === 0) {
    throw quoteError('QUOTE_NOT_OFFERED', 'Quote is not in offered state.');
  }

  return {
    orderId: order.id,
    quoteStatus: 'declined' as const,
    changed: true,
    version,
  };
}

export async function assertIntlPaymentInitAllowed(args: {
  orderId: string;
  provider: 'stripe' | 'monobank';
  now?: Date;
}) {
  const now = args.now ?? new Date();
  const order = await loadOrderQuote(args.orderId);

  if (order.fulfillmentMode !== 'intl') {
    return { order };
  }

  if (args.provider !== 'stripe') {
    throw quoteError(
      'PAYMENT_PROVIDER_NOT_ALLOWED_FOR_INTL',
      'Only Stripe is allowed for international quote payments.'
    );
  }

  if (order.quoteStatus !== 'accepted') {
    throw quoteError(
      'QUOTE_NOT_ACCEPTED',
      'Quote must be accepted before payment initialization.'
    );
  }

  if (
    !order.quotePaymentDeadlineAt ||
    order.quotePaymentDeadlineAt.getTime() <= now.getTime()
  ) {
    throw quoteError(
      'QUOTE_PAYMENT_WINDOW_EXPIRED',
      'Quote payment deadline has expired.'
    );
  }

  if (order.inventoryStatus !== 'reserved') {
    throw quoteError(
      'QUOTE_INVENTORY_NOT_RESERVED',
      'Inventory must be reserved before payment initialization.'
    );
  }

  if (!order.quoteVersion) {
    throw quoteError(
      'QUOTE_VERSION_CONFLICT',
      'Order quote version is missing for accepted quote.'
    );
  }

  const quote = await loadQuoteByVersion(order.id, order.quoteVersion);
  if (!quote || quote.status !== 'accepted') {
    throw quoteError(
      'QUOTE_NOT_ACCEPTED',
      'Latest quote must be accepted before payment initialization.'
    );
  }

  if (quote.currency !== order.currency) {
    throw quoteError(
      'QUOTE_CURRENCY_MISMATCH',
      'Quote currency must match order currency.'
    );
  }

  return { order };
}

export async function sweepExpiredOfferedIntlQuotes(options?: {
  batchSize?: number;
  now?: Date;
}): Promise<number> {
  const batchSize = Math.max(
    1,
    Math.min(100, Math.floor(options?.batchSize ?? 50))
  );
  const now = options?.now ?? new Date();

  const candidates = await db
    .select({
      orderId: shippingQuotes.orderId,
      version: shippingQuotes.version,
    })
    .from(shippingQuotes)
    .where(
      and(
        eq(shippingQuotes.status, 'offered'),
        lte(shippingQuotes.expiresAt, now)
      )
    )
    .orderBy(asc(shippingQuotes.expiresAt))
    .limit(batchSize);

  let processed = 0;
  for (const candidate of candidates) {
    const ok = await atomicExpireQuote({
      orderId: candidate.orderId,
      version: candidate.version,
      now,
      eventSource: 'intl_quote_sweep',
      eventRef: `sweep-expire:${candidate.orderId}:${candidate.version}:${now.toISOString()}`,
      reason: 'offer_expired',
    });
    if (ok) processed += 1;
  }

  return processed;
}

export async function sweepAcceptedIntlQuotePaymentTimeouts(options?: {
  batchSize?: number;
  now?: Date;
}): Promise<number> {
  const batchSize = Math.max(
    1,
    Math.min(100, Math.floor(options?.batchSize ?? 50))
  );
  const now = options?.now ?? new Date();

  const candidates = await db
    .select({
      orderId: orders.id,
      quoteVersion: orders.quoteVersion,
      inventoryStatus: orders.inventoryStatus,
    })
    .from(orders)
    .where(
      and(
        eq(orders.fulfillmentMode, 'intl'),
        eq(orders.quoteStatus, 'accepted'),
        lte(orders.quotePaymentDeadlineAt, now)
      )
    )
    .orderBy(asc(orders.quotePaymentDeadlineAt))
    .limit(batchSize);

  let processed = 0;

  for (const candidate of candidates) {
    if (!candidate.quoteVersion) continue;

    await restockOrder(candidate.orderId, {
      reason: 'stale',
      workerId: 'intl_quote_timeout_sweep',
    });

    const [postRestock] = await db
      .select({
        inventoryStatus: orders.inventoryStatus,
      })
      .from(orders)
      .where(eq(orders.id, candidate.orderId))
      .limit(1);

    if (!postRestock || postRestock.inventoryStatus !== 'released') {
      continue;
    }

    const dedupeKey = makeQuoteEventDedupeKey({
      action: 'quote_timeout_requires_requote',
      orderId: candidate.orderId,
      version: candidate.quoteVersion,
    });

    const updateRes = await db.execute(sql`
      with updated_quote as (
        update shipping_quotes q
        set status = 'requires_requote',
            updated_at = ${now}
        where q.order_id = ${candidate.orderId}::uuid
          and q.version = ${candidate.quoteVersion}
          and q.status = 'accepted'
        returning q.order_id
      ),
      updated_order as (
        update orders o
        set quote_status = 'requires_requote',
            quote_payment_deadline_at = null,
            quote_accepted_at = null,
            updated_at = ${now}
        where o.id in (select order_id from updated_quote)
          and o.fulfillment_mode = 'intl'
          and ${orderQuoteTransitionWhereSql({
            column: sql`o.quote_status`,
            to: 'requires_requote',
          })}
        returning o.id
      ),
      inserted_event as (
        insert into shipping_events (
          order_id,
          shipment_id,
          provider,
          event_name,
          event_source,
          event_ref,
          status_from,
          status_to,
          tracking_number,
          payload,
          dedupe_key,
          occurred_at,
          created_at
        )
        select
          uo.id,
          null,
          'intl_quote',
          'quote_timeout_requires_requote',
          'intl_quote_sweep',
          ${`sweep-timeout:${candidate.orderId}:${candidate.quoteVersion}`},
          'accepted',
          'requires_requote',
          null,
          ${JSON.stringify({
            version: candidate.quoteVersion,
          })}::jsonb,
          ${dedupeKey},
          ${now},
          ${now}
        from updated_order uo
        where ${canonicalFlag()} = true
        on conflict (dedupe_key) do nothing
        returning id
      )
      select (select count(*)::int from updated_order) as updated_order_count
    `);

    if (Number((updateRes as any)?.rows?.[0]?.updated_order_count ?? 0) > 0) {
      processed += 1;
    }
  }

  return processed;
}
