import 'server-only';

import { NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';

export async function GET() {
  const user = await getCurrentUser();
  const payload = user
    ? { id: user.id, role: user.role, username: user.username }
    : null;

  return NextResponse.json(payload, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
