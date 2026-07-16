// Push notifications via Firebase Cloud Messaging. Tokens are registered per
// device by the mobile app; sendPush fans a message out to all of a user's
// tokens. Mirrors email.ts: failures are swallowed so a push problem never
// breaks the triggering mutation.

import type { PrismaClient } from '@garage-sale/db';
import { getMessaging } from 'firebase-admin/messaging';
import { firebaseApp } from './firebase.js';

export async function registerPushToken(
  prisma: PrismaClient,
  userId: string,
  token: string,
  platform?: string,
): Promise<void> {
  await prisma.pushToken.upsert({
    where: { token },
    create: { userId, token, platform },
    update: { userId, platform },
  });
}

export async function unregisterPushToken(prisma: PrismaClient, token: string): Promise<void> {
  await prisma.pushToken.deleteMany({ where: { token } });
}

/** FCM error codes that mean the token is permanently dead (app uninstalled, etc.). */
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

/**
 * Legacy Expo push tokens (registered by the pre-Flutter RN app) look like
 * `ExponentPushToken[...]` / `ExpoPushToken[...]`. They are NOT valid FCM
 * registration tokens — `sendEachForMulticast` rejects them with an error
 * outside DEAD_TOKEN_CODES, so they'd never be pruned and would linger in the
 * table forever. Recognise them so we can drop them instead of sending.
 */
function isExpoToken(token: string): boolean {
  return token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[');
}

/** Send a push to every device the user has registered. No-op when none. */
export async function sendPush(
  prisma: PrismaClient,
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  const rows = await prisma.pushToken.findMany({
    where: { userId },
    select: { token: true },
  });
  if (rows.length === 0) return;

  // Prune any legacy Expo-format tokens up front — they can't be delivered via
  // FCM, so they'd otherwise never be cleaned up (see isExpoToken).
  const legacy = rows.filter((t) => isExpoToken(t.token)).map((t) => t.token);
  if (legacy.length > 0) {
    await prisma.pushToken.deleteMany({ where: { token: { in: legacy } } });
  }
  const tokens = rows.filter((t) => !isExpoToken(t.token));
  if (tokens.length === 0) return;

  try {
    const response = await getMessaging(firebaseApp()).sendEachForMulticast({
      tokens: tokens.map((t) => t.token),
      notification: { title, body },
      data,
    });
    const dead = response.responses
      .map((r, i) => ({ r, token: tokens[i]!.token }))
      .filter(({ r }) => !r.success && r.error && DEAD_TOKEN_CODES.has(r.error.code))
      .map(({ token }) => token);
    if (dead.length > 0) {
      await prisma.pushToken.deleteMany({ where: { token: { in: dead } } });
    }
  } catch {
    // Swallow — a push failure must not break the mutation that triggered it.
  }
}
