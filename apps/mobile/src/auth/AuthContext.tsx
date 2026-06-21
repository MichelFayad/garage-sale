// Auth state for the mobile app: hydrates a session from stored tokens on boot,
// exposes credentials + OAuth sign-in, and persists/clears tokens via secure store.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { trpc } from '../api/client';
import { clearTokens, getRefreshToken, saveTokens, type TokenPair } from './storage';

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
}

export type OAuthExchange =
  | { provider: 'GOOGLE' | 'APPLE'; idToken: string }
  | { provider: 'FACEBOOK'; accessToken: string };

interface AuthContextValue {
  status: 'loading' | 'authenticated' | 'unauthenticated';
  user: SessionUser | null;
  login(email: string, password: string): Promise<void>;
  /** Registers the trader; they must verify their email before they can log in. */
  register(email: string, password: string, displayName: string): Promise<void>;
  signInWithProvider(input: OAuthExchange): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthContextValue['status']>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);

  const applyTokens = useCallback(async (tokens: TokenPair) => {
    await saveTokens(tokens);
    const me = await trpc.auth.me.query();
    if (me.kind !== 'trader') throw new Error('Not a trader account');
    setUser({
      id: me.id,
      email: me.email,
      displayName: me.displayName,
      emailVerified: me.emailVerified,
    });
    setStatus('authenticated');
  }, []);

  const hydrate = useCallback(async () => {
    try {
      const me = await trpc.auth.me.query();
      if (me.kind === 'trader') {
        setUser({
          id: me.id,
          email: me.email,
          displayName: me.displayName,
          emailVerified: me.emailVerified,
        });
        setStatus('authenticated');
        return;
      }
    } catch {
      // access token missing/expired — try a refresh below.
    }
    const refreshToken = await getRefreshToken();
    if (refreshToken) {
      try {
        const { tokens } = await trpc.auth.refresh.mutate({ refreshToken });
        await applyTokens(tokens);
        return;
      } catch {
        await clearTokens();
      }
    }
    setStatus('unauthenticated');
  }, [applyTokens]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const login = useCallback(
    async (email: string, password: string) => {
      const { tokens } = await trpc.auth.login.mutate({ email, password });
      await applyTokens(tokens);
    },
    [applyTokens],
  );

  const register = useCallback(async (email: string, password: string, displayName: string) => {
    await trpc.auth.register.mutate({ email, password, displayName });
    // No tokens issued — verification required before first login.
  }, []);

  const signInWithProvider = useCallback(
    async (input: OAuthExchange) => {
      const { tokens } = await trpc.oauth.exchange.mutate(input);
      await applyTokens(tokens);
    },
    [applyTokens],
  );

  const logout = useCallback(async () => {
    await clearTokens();
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, login, register, signInWithProvider, logout }),
    [status, user, login, register, signInWithProvider, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
