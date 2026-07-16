import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '@garage-sale/db';
import { sendPush } from './push.js';

const sendEachForMulticast = vi.fn();

vi.mock('firebase-admin/messaging', () => ({
  getMessaging: () => ({ sendEachForMulticast }),
}));

vi.mock('./firebase.js', () => ({
  firebaseApp: () => ({}),
}));

function fakePrisma(tokens: { token: string }[]): PrismaClient {
  return {
    pushToken: {
      findMany: vi.fn().mockResolvedValue(tokens),
      deleteMany: vi.fn().mockResolvedValue({ count: tokens.length }),
    },
  } as unknown as PrismaClient;
}

describe('sendPush', () => {
  beforeEach(() => {
    sendEachForMulticast.mockReset();
  });

  it('no-ops when the user has no registered tokens', async () => {
    const prisma = fakePrisma([]);

    await sendPush(prisma, 'u1', 'Title', 'Body');

    expect(sendEachForMulticast).not.toHaveBeenCalled();
  });

  it('sends to every registered token', async () => {
    const prisma = fakePrisma([{ token: 't1' }, { token: 't2' }]);
    sendEachForMulticast.mockResolvedValue({
      responses: [{ success: true }, { success: true }],
    });

    await sendPush(prisma, 'u1', 'Title', 'Body');

    expect(sendEachForMulticast).toHaveBeenCalledWith(
      expect.objectContaining({ tokens: ['t1', 't2'] }),
    );
  });

  it('prunes tokens FCM reports as unregistered', async () => {
    const prisma = fakePrisma([{ token: 'dead' }, { token: 'alive' }]);
    sendEachForMulticast.mockResolvedValue({
      responses: [
        { success: false, error: { code: 'messaging/registration-token-not-registered' } },
        { success: true },
      ],
    });

    await sendPush(prisma, 'u1', 'Title', 'Body');

    expect(prisma.pushToken.deleteMany).toHaveBeenCalledWith({
      where: { token: { in: ['dead'] } },
    });
  });

  it('does not prune tokens that failed for a different reason', async () => {
    const prisma = fakePrisma([{ token: 't1' }]);
    sendEachForMulticast.mockResolvedValue({
      responses: [{ success: false, error: { code: 'messaging/internal-error' } }],
    });

    await sendPush(prisma, 'u1', 'Title', 'Body');

    expect(prisma.pushToken.deleteMany).not.toHaveBeenCalled();
  });

  it('swallows a thrown error instead of propagating it', async () => {
    const prisma = fakePrisma([{ token: 't1' }]);
    sendEachForMulticast.mockRejectedValue(new Error('FCM is down'));

    await expect(sendPush(prisma, 'u1', 'Title', 'Body')).resolves.toBeUndefined();
  });

  it('prunes legacy Expo-format tokens and never sends them to FCM', async () => {
    const prisma = fakePrisma([{ token: 'ExponentPushToken[abc]' }, { token: 'fcm1' }]);
    sendEachForMulticast.mockResolvedValue({ responses: [{ success: true }] });

    await sendPush(prisma, 'u1', 'Title', 'Body');

    // The Expo token is deleted up front...
    expect(prisma.pushToken.deleteMany).toHaveBeenCalledWith({
      where: { token: { in: ['ExponentPushToken[abc]'] } },
    });
    // ...and only the real FCM token is sent.
    expect(sendEachForMulticast).toHaveBeenCalledWith(
      expect.objectContaining({ tokens: ['fcm1'] }),
    );
  });

  it('no-ops FCM (but still prunes) when the user only has Expo tokens', async () => {
    const prisma = fakePrisma([{ token: 'ExpoPushToken[xyz]' }]);

    await sendPush(prisma, 'u1', 'Title', 'Body');

    expect(prisma.pushToken.deleteMany).toHaveBeenCalledWith({
      where: { token: { in: ['ExpoPushToken[xyz]'] } },
    });
    expect(sendEachForMulticast).not.toHaveBeenCalled();
  });
});
