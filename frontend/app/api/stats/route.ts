import { NextResponse } from 'next/server';
import { getPlatformStats } from '@/lib/about/stats';

export async function GET() {
  try {
    const stats = await getPlatformStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error('Failed to fetch platform stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
