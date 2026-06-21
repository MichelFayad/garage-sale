import { router } from './trpc.js';
import { healthRouter } from './routers/health.js';
import { authRouter } from './routers/auth.js';
import { oauthRouter } from './routers/oauth.js';
import { billingRouter } from './routers/billing.js';
import { listingsRouter } from './routers/listings.js';

// Root router — trade/messaging routers are added P6+.
export const appRouter = router({
  health: healthRouter,
  auth: authRouter,
  oauth: oauthRouter,
  billing: billingRouter,
  listings: listingsRouter,
});

export type AppRouter = typeof appRouter;
