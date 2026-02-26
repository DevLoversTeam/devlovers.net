'use client';

import { broadcastAuthUpdated } from '@/lib/auth-sync';

export async function logout() {
  await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'same-origin',
  });

  broadcastAuthUpdated();
}
