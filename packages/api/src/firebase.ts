// Lazy Firebase Admin app singleton, built from FIREBASE_* env vars on first
// use. Server-only. Mirrors stripe.ts's lazy-client pattern.

import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';

let app: App | undefined;

/** The shared Firebase Admin app, built from FIREBASE_* env vars on first use. */
export function firebaseApp(): App {
  if (!app) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;
    if (!projectId || !clientEmail || !privateKey) {
      throw new Error(
        'FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY are not set',
      );
    }
    app =
      getApps()[0] ??
      initializeApp({
        credential: cert({ projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, '\n') }),
      });
  }
  return app;
}
