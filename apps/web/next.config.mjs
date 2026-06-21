/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages ship raw TypeScript — let Next compile them.
  transpilePackages: [
    '@garage-sale/api',
    '@garage-sale/auth',
    '@garage-sale/core',
    '@garage-sale/db',
  ],
};

export default nextConfig;
