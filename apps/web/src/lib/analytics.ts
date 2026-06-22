// Privacy-friendly analytics shim. The provider (Plausible-compatible) is loaded
// only when NEXT_PUBLIC_ANALYTICS_DOMAIN is set — see components/Analytics.tsx —
// so dev and self-hosters get a no-op by default. No cookies, no PII: we send
// named events with coarse props only.

declare global {
  interface Window {
    plausible?: (event: string, options?: { props?: Record<string, string | number> }) => void;
  }
}

/** Record a named analytics event. No-op when no provider is loaded. */
export function track(event: string, props?: Record<string, string | number>): void {
  if (typeof window === 'undefined') return;
  window.plausible?.(event, props ? { props } : undefined);
}
