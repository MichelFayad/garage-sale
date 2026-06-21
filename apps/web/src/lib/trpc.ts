// Browser tRPC client for the web portal. Used by the auth forms for the
// no-session mutations (register, email verification, password reset). The
// session-setting flows (login/logout) go through /api/auth/* route handlers
// because cookies must be set on the HTTP response, not inside tRPC context.

import { createTRPCClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from '@garage-sale/api';

export const trpc = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: '/api/trpc', transformer: superjson })],
});
