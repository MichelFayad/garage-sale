// Push notifications via the Expo Push API. Tokens are registered per device by the
// mobile app; sendPush fans a message out to all of a user's tokens. Mirrors email.ts:
// failures are swallowed so a push problem never breaks the triggering mutation.

import type { PrismaClient } from '@garage-sale/db';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

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

interface ExpoTicket {
  status?: string;
  details?: { error?: string };
}

/** Send a push to every device the user has registered. No-op when none. */
export async function sendPush(
  prisma: PrismaClient,
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  const tokens = await prisma.pushToken.findMany({
    where: { userId },
    select: { token: true },
  });
  if (tokens.length === 0) return;

  const messages = tokens.map((t) => ({ to: t.token, title, body, sound: 'default', data }));

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(messages),
    });
    const json = (await res.json()) as { data?: ExpoTicket[] };
    // Prune tokens Expo reports as no longer registered (app uninstalled, etc.).
    const tickets = json.data;
    if (Array.isArray(tickets)) {
      const dead = tickets
        .map((ticket, i) => ({ ticket, token: messages[i]?.to }))
        .filter(
          (x) =>
            x.token &&
            x.ticket?.status === 'error' &&
            x.ticket?.details?.error === 'DeviceNotRegistered',
        )
        .map((x) => x.token as string);
      if (dead.length > 0) {
        await prisma.pushToken.deleteMany({ where: { token: { in: dead } } });
      }
    }
  } catch {
    // Swallow — a push failure must not break the mutation that triggered it.
  }
}
