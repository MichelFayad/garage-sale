/** @type {import('next').NextConfig} */

// Origin that serves the analytics script + receives events (self-hosted or the
// public Plausible host). Folded into the CSP so the beacon isn't blocked.
const analyticsOrigin = (() => {
  const src = process.env.NEXT_PUBLIC_ANALYTICS_SRC;
  try {
    if (src) return new URL(src).origin;
  } catch {
    // malformed override → fall back to the public host
  }
  return 'https://plausible.io';
})();

// Content-Security-Policy. Stripe.js + its frames/API are allow-listed; the
// analytics origin is added for the script + beacon. 'unsafe-inline' is kept
// for scripts/styles because the App Router emits inline bootstrap scripts and
// JSON-LD without a nonce — tightening to nonce-based CSP is a follow-up.
// Next dev mode wraps webpack modules in eval() for source maps/HMR — needs
// 'unsafe-eval' or the client bundle silently fails to execute (no hydration,
// no console error visible through most tooling). Production builds don't use
// eval, so this only applies in dev.
const scriptSrcEval = process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : '';

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${scriptSrcEval} https://js.stripe.com ${analyticsOrigin}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  `connect-src 'self' https://api.stripe.com ${analyticsOrigin}`,
  'frame-src https://js.stripe.com https://hooks.stripe.com',
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

// Security headers applied to every route. HSTS only matters over HTTPS (no-op
// on http://localhost); the rest harden clickjacking, sniffing, and referrer
// leakage.
const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

const nextConfig = {
  reactStrictMode: true,
  // Keep Prisma's native query-engine binary out of the webpack bundle so it
  // loads from node_modules at runtime instead of needing to be copied.
  serverExternalPackages: ['@prisma/client'],
  // Workspace packages ship raw TypeScript — let Next compile them.
  transpilePackages: [
    '@garage-sale/api',
    '@garage-sale/auth',
    '@garage-sale/core',
    '@garage-sale/db',
  ],
  // Workspace packages use TS's "Bundler" moduleResolution convention of
  // writing `.js` extensions in relative imports that actually resolve to
  // `.ts` source files. Webpack doesn't map that by default (only Vite/esbuild
  // do), so transpiled workspace packages 404 on their own internal imports
  // without this alias.
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.resolve.extensionAlias = {
        '.js': ['.ts', '.tsx', '.js'],
      };
    }
    return config;
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
