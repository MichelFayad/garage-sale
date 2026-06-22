// Navigation state for the native User Portal. Holds the active tab plus a screen
// stack; pushing adds a screen, back pops, switching tabs resets the stack to that
// tab's root. Deliberately dependency-free to match the lightweight tab shell.

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { TAB_ROOTS, type Route, type TabKey } from './routes';

interface NavValue {
  route: Route;
  tab: TabKey;
  canGoBack: boolean;
  push(route: Route): void;
  pop(): void;
  switchTab(tab: TabKey): void;
}

const NavContext = createContext<NavValue | null>(null);

export function NavProvider({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<TabKey>('home');
  const [stack, setStack] = useState<Route[]>([TAB_ROOTS.home]);

  const push = useCallback((route: Route) => {
    setStack((s) => [...s, route]);
  }, []);

  const pop = useCallback(() => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  }, []);

  const switchTab = useCallback((next: TabKey) => {
    setTab(next);
    setStack([TAB_ROOTS[next]]);
  }, []);

  const value = useMemo<NavValue>(
    () => ({
      route: stack[stack.length - 1],
      tab,
      canGoBack: stack.length > 1,
      push,
      pop,
      switchTab,
    }),
    [stack, tab, push, pop, switchTab],
  );

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav(): NavValue {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error('useNav must be used within NavProvider');
  return ctx;
}
