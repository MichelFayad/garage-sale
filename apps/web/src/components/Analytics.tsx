import Script from 'next/script';

// Loads the privacy-friendly analytics provider (Plausible-compatible) only when
// NEXT_PUBLIC_ANALYTICS_DOMAIN is configured. Cookieless and GDPR-friendly; the
// script host defaults to plausible.io but can point at a self-hosted instance
// via NEXT_PUBLIC_ANALYTICS_SRC. Renders nothing when unset (dev default).
export function Analytics() {
  const domain = process.env.NEXT_PUBLIC_ANALYTICS_DOMAIN;
  if (!domain) return null;
  const src = process.env.NEXT_PUBLIC_ANALYTICS_SRC ?? 'https://plausible.io/js/script.js';
  return <Script src={src} data-domain={domain} strategy="afterInteractive" />;
}
