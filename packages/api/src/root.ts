import { router } from './trpc.js';
import { healthRouter } from './routers/health.js';
import { authRouter } from './routers/auth.js';
import { oauthRouter } from './routers/oauth.js';
import { billingRouter } from './routers/billing.js';

// Root router — feature routers (listings, trades, …) are added P5+.
export const appRouter = router({
  health: healthRouter,
  auth: authRouter,
  oauth: oauthRouter,
  billing: billingRouter,
});

export type AppRouter = typeof appRouter;
