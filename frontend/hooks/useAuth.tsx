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

type AuthApiUser = {
  id: string;
  role: 'user' | 'admin';
  username: string;
} | null;

type AuthContextValue = {
  user: AuthApiUser;
  userExists: boolean;
  userId: string | null;
  isAdmin: boolean;
  username: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthApiUser>(null);
  const [loading, setLoading] = useState(true);
  const latestRequestIdRef = useRef(0);

  const runAuthRequest = useCallback(async (signal?: AbortSignal) => {
    const requestId = ++latestRequestIdRef.current;
    setLoading(true);

    try {
      const nextUser = await fetchAuth(signal);

      if (latestRequestIdRef.current !== requestId) {
        return;
      }

      setUser(nextUser);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      if (latestRequestIdRef.current !== requestId) {
        return;
      }

      setUser(null);
    } finally {
      if (latestRequestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, []);

  const refresh = useCallback(async () => {
    await runAuthRequest();
  }, [runAuthRequest]);

  useEffect(() => {
    const controller = new AbortController();

    void runAuthRequest(controller.signal);

    return () => {
      controller.abort();
    };
  }, [runAuthRequest]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      userExists: Boolean(user),
      userId: user?.id ?? null,
      isAdmin: user?.role === 'admin',
      username: user?.username ?? null,
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
