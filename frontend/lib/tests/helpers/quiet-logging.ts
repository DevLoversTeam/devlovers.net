import { vi } from 'vitest';

export async function createQuietLoggingMock() {
  const actual = await vi.importActual<typeof import('@/lib/logging')>(
    '@/lib/logging'
  );

  return {
    ...actual,
    logWarn: () => {},
    logError: () => {},
    logInfo: () => {},
  };
}
