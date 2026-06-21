import { router } from './trpc.js';
import { healthRouter } from './routers/health.js';

// Root router — feature routers (auth, listings, trades, …) are added P2+.
export const appRouter = router({
  health: healthRouter,
});

export type AppRouter = typeof appRouter;
