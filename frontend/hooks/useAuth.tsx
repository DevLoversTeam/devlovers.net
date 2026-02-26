'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { subscribeToAuthUpdates } from '@/lib/auth-sync';

type AuthApiUser = {
  id: string;
  role: 'user' | 'admin';
} | null;

type AuthContextValue = {
  user: AuthApiUser;
  userExists: boolean;
  userId: string | null;
  isAdmin: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
let authUserCache: AuthApiUser | undefined;
let authUserCacheAt = 0;
let inFlightAuthPromise: Promise<AuthApiUser> | null = null;

const AUTH_CACHE_TTL_MS = 60_000;

async function fetchAuth(signal?: AbortSignal): Promise<AuthApiUser> {
  const response = await fetch('/api/auth/me', {
    method: 'GET',
    cache: 'no-store',
    credentials: 'include',
    signal,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch auth state: ${response.status}`);
  }

  return (await response.json()) as AuthApiUser;
}

function isCacheFresh(): boolean {
  if (authUserCache === undefined) return false;
  return Date.now() - authUserCacheAt < AUTH_CACHE_TTL_MS;
}

function fetchAuthDeduped(): Promise<AuthApiUser> {
  if (inFlightAuthPromise) {
    return inFlightAuthPromise;
  }

  inFlightAuthPromise = fetchAuth().finally(() => {
    inFlightAuthPromise = null;
  });

  return inFlightAuthPromise;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthApiUser>(authUserCache ?? null);
  const [loading, setLoading] = useState(authUserCache === undefined);
  const latestRequestIdRef = useRef(0);

  const runAuthRequest = useCallback(async (options?: { force?: boolean }) => {
    const force = options?.force ?? false;

    if (!force && isCacheFresh()) {
      setUser(authUserCache ?? null);
      setLoading(false);
      return;
    }

    const requestId = ++latestRequestIdRef.current;
    setLoading(authUserCache === undefined || force);

    try {
      const nextUser = await fetchAuthDeduped();

      if (latestRequestIdRef.current !== requestId) {
        return;
      }

      authUserCache = nextUser;
      authUserCacheAt = Date.now();
      setUser(nextUser);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      if (latestRequestIdRef.current !== requestId) {
        return;
      }

      authUserCache = null;
      authUserCacheAt = Date.now();
      setUser(null);
    } finally {
      if (latestRequestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, []);

  const refresh = useCallback(async () => {
    await runAuthRequest({ force: true });
  }, [runAuthRequest]);

  useEffect(() => {
    void runAuthRequest();
  }, [runAuthRequest]);

  useEffect(() => {
    const handleFocus = () => {
      void runAuthRequest();
    };

    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [runAuthRequest]);

  useEffect(() => {
    return subscribeToAuthUpdates(() => {
      void runAuthRequest({ force: true });
    });
  }, [runAuthRequest]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      userExists: Boolean(user),
      userId: user?.id ?? null,
      isAdmin: user?.role === 'admin',
      loading,
      refresh,
    }),
    [user, loading, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
