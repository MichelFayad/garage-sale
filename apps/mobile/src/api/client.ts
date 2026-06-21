// Typed tRPC client for the shared API. Bearer token (from secure store) is
// attached per request; a 401 triggers a one-shot refresh in AuthContext.

import { createTRPCClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from '@garage-sale/api';
import { getAccessToken } from '../auth/storage';

const baseUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api';

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${baseUrl}/trpc`,
      transformer: superjson,
      async headers() {
        const token = await getAccessToken();
        return token ? { authorization: `Bearer ${token}` } : {};
      },
    }),
  ],
});
