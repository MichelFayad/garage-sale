import { router } from './trpc.js';
import { healthRouter } from './routers/health.js';
import { authRouter } from './routers/auth.js';
import { oauthRouter } from './routers/oauth.js';
import { billingRouter } from './routers/billing.js';
import { listingsRouter } from './routers/listings.js';
import { browseRouter } from './routers/browse.js';
import { watchlistRouter } from './routers/watchlist.js';
import { tradesRouter } from './routers/trades.js';
import { blocksRouter } from './routers/blocks.js';
import { adminRouter } from './routers/admin.js';

// Root router — trade/messaging routers are added P6+; admin lands P9.
export const appRouter = router({
  health: healthRouter,
  auth: authRouter,
  oauth: oauthRouter,
  billing: billingRouter,
  listings: listingsRouter,
  browse: browseRouter,
  watchlist: watchlistRouter,
  trades: tradesRouter,
  blocks: blocksRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
