// @garage-sale/api — typed API contract consumed by web and mobile.
export { appRouter, type AppRouter } from './root.js';
export { createContext, type Context, type AuthPrincipal } from './trpc.js';
export { oauthSignIn, OAuthError, type OAuthExchangeInput } from './oauth.js';
export { constructStripeEvent } from './stripe.js';
export { handleStripeEvent } from './billing.js';
