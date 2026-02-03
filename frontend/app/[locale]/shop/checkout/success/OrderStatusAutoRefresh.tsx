'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

type Props = {
  paymentStatus: string;
  maxMs?: number;
  intervalMs?: number;
};

function isTerminal(status: string) {
  return status === 'paid' || status === 'failed' || status === 'refunded';
}

export default function OrderStatusAutoRefresh({
  paymentStatus,
  maxMs = 30_000,
  intervalMs = 1_500,
}: Props) {
  const router = useRouter();
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (isTerminal(paymentStatus)) return;

    if (startedAtRef.current == null) startedAtRef.current = Date.now();

    const id = window.setInterval(() => {
      const startedAt = startedAtRef.current ?? Date.now();
      if (Date.now() - startedAt > maxMs) {
        window.clearInterval(id);
        return;
      }
      router.refresh();
    }, intervalMs);

    return () => window.clearInterval(id);
  }, [paymentStatus, router, maxMs, intervalMs]);

  return <span className="sr-only" aria-live="polite" />;
}
