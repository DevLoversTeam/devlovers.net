'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const nextUser = await fetchAuth();
      setUser(nextUser);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    const loadAuth = async () => {
      try {
        const nextUser = await fetchAuth(controller.signal);
        setUser(nextUser);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    void loadAuth();

    return () => {
      controller.abort();
    };
  }, []);

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
