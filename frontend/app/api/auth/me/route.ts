import 'server-only';

import { NextResponse } from 'next/server';

import { getAuthSession } from '@/lib/auth';

export async function GET() {
  const session = await getAuthSession();
  const payload = session ? { id: session.id, role: session.role } : null;

  return NextResponse.json(payload, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
