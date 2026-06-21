import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter, createContext } from '@garage-sale/api';

// Shared tRPC endpoint consumed by the web User Portal and the mobile app.
// Principal resolution (cookie session / JWT bearer) is wired in P2.
const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => createContext(),
  });

export { handler as GET, handler as POST };
