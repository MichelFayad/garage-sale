import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter, createContext } from '@garage-sale/api';

// Shared tRPC endpoint consumed by the web User Portal and the mobile app.
// Principal is resolved from the session cookie (web) or bearer header (mobile).
const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => createContext({ headers: req.headers }),
  });

export { handler as GET, handler as POST };
