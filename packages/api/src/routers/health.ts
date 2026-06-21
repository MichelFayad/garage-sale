import { publicProcedure, router } from '../trpc.js';

export const healthRouter = router({
  ping: publicProcedure.query(() => ({
    ok: true as const,
    service: 'garage-sale-api',
    time: new Date().toISOString(),
  })),
});
