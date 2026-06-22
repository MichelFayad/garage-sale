// Server-side tRPC caller for React Server Components. Browser code uses the
// HTTP client in trpc.ts; server components (SSR data, generateMetadata, sitemap)
// call the router in-process via createCaller with a context built from the
// request headers — so the same principal resolution + access rules apply.

import { headers } from 'next/headers';
import { appRouter, createContext } from '@garage-sale/api';

export async function serverApi() {
  const h = await headers();
  const ctx = await createContext({ headers: h as unknown as Headers });
  return appRouter.createCaller(ctx);
}
