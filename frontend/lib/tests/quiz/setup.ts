/**
 * 32-byte hex key for AES-256 (64 hex characters)
 * Only used in tests — not a real secret
 */
export const TEST_ENCRYPTION_KEY =
  'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';

export function setupQuizTestEnv(): void {
  process.env.QUIZ_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
}

/**
 * Cleans up test environment
 * Call in afterEach() to prevent test pollution
 */
export function cleanupQuizTestEnv(): void {
  delete process.env.QUIZ_ENCRYPTION_KEY;
}

export function createMockLocalStorage() {
  const store: Record<string, string> = {};

  const mockStorage = {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      Object.keys(store).forEach(key => delete store[key]);
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
  };

  return {
    storage: mockStorage,
    store,
  };
}

export function installMockLocalStorage() {
  const mock = createMockLocalStorage();

  Object.defineProperty(globalThis, 'localStorage', {
    value: mock.storage,
    writable: true,
    configurable: true,
  });

  if (typeof globalThis.window === 'undefined') {
    Object.defineProperty(globalThis, 'window', {
      value: { localStorage: mock.storage },
      writable: true,
      configurable: true,
    });
  }

  return mock;
}
