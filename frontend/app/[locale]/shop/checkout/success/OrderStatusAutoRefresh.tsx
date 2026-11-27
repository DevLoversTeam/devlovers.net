'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

import {
  fetchCheckoutOrderStatus,
  getCheckoutOrderStatusErrorCode,
} from '@/lib/shop/checkout-order-status';
import { trimToNull } from '@/lib/utils/trim-to-null';

type Props = {
  paymentStatus: string;
};

const MAX_ATTEMPTS = 8;
const MAX_DURATION_MS = 2 * 60 * 1000;
const BASE_DELAY_MS = 2_000;
const MAX_DELAY_MS = 15_000;
const JITTER_RATIO = 0.2;
const TERMINAL_STATUSES = new Set([
  'paid',
  'failed',
  'refunded',
  'needs_review',
]);

type StatusFetchResult =
  | { ok: true; paymentStatus: string }
  | { ok: false; status: number; code: string };

function isTerminal(status: string): boolean {
  return TERMINAL_STATUSES.has(status);
}

function shouldStopOnError(status: number, code: string): boolean {
  if (status === 401 || status === 403) return true;
  if (status !== 400) return false;
  const normalized = code.trim().toUpperCase();
  return (
    normalized === 'STATUS_TOKEN_INVALID' ||
    normalized === 'INVALID_STATUS_TOKEN' ||
    normalized.endsWith('TOKEN_INVALID')
  );
}

function getBackoffDelayMs(attempt: number): number {
  return Math.min(BASE_DELAY_MS * 2 ** Math.max(attempt - 1, 0), MAX_DELAY_MS);
}

function withJitter(delayMs: number): number {
  const jitterMultiplier = 1 + (Math.random() * 2 - 1) * JITTER_RATIO;
  return Math.max(0, Math.floor(delayMs * jitterMultiplier));
}

function parseLitePaymentStatus(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as Record<string, unknown>;
  const paymentStatus = root.paymentStatus;
  if (typeof paymentStatus !== 'string') return null;
  const trimmed = paymentStatus.trim();
  return trimmed.length ? trimmed : null;
}

async function fetchLiteOrderStatus(args: {
  orderId: string;
  statusToken: string | null;
  signal: AbortSignal;
}): Promise<StatusFetchResult> {
  const { ok, status, payload } = await fetchCheckoutOrderStatus(args);
  if (!ok) {
    return { ok: false, status, code: getCheckoutOrderStatusErrorCode(payload) };
  }

  const paymentStatus = parseLitePaymentStatus(payload);
  if (!paymentStatus) {
    return { ok: false, status: 500, code: 'INVALID_STATUS_RESPONSE' };
  }

  return { ok: true, paymentStatus };
}

export default function OrderStatusAutoRefresh({ paymentStatus }: Props) {
  const router = useRouter();
  const didTerminalRefreshRef = useRef(false);

  useEffect(() => {
    if (isTerminal(paymentStatus)) return;

    let cancelled = false;
    let timeoutId: number | null = null;
    let activeController: AbortController | null = null;
    const startedAtMs = Date.now();
    let attempts = 0;

    const params = new URLSearchParams(window.location.search);
    const orderId = trimToNull(params.get('orderId'));
    if (!orderId) return;

    const statusToken = trimToNull(params.get('statusToken'));

    const wait = async (delayMs: number) =>
      new Promise<void>(resolve => {
        timeoutId = window.setTimeout(resolve, delayMs);
      });

    const run = async () => {
      while (!cancelled) {
        if (attempts >= MAX_ATTEMPTS) return;
        if (Date.now() - startedAtMs >= MAX_DURATION_MS) return;

        attempts += 1;
        const controller = new AbortController();
        activeController = controller;
        const result = await fetchLiteOrderStatus({
          orderId,
          statusToken,
          signal: controller.signal,
        }).catch(
          (): StatusFetchResult => ({
            ok: false,
            status: 500,
            code: 'INTERNAL_ERROR',
          })
        );

        if (cancelled) {
          return;
        }
        activeController = null;

        if (result.ok) {
          if (isTerminal(result.paymentStatus)) {
            if (!didTerminalRefreshRef.current) {
              didTerminalRefreshRef.current = true;
              router.refresh();
            }
            return;
          }
        } else if (shouldStopOnError(result.status, result.code)) {
          return;
        }

        if (attempts >= MAX_ATTEMPTS) return;
        if (Date.now() - startedAtMs >= MAX_DURATION_MS) return;

        const delayMs = withJitter(getBackoffDelayMs(attempts));
        await wait(delayMs);
      }
    };

    void run();

    return () => {
      cancelled = true;
      activeController?.abort();
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [paymentStatus, router]);

  return <span className="sr-only" aria-live="polite" />;
}
