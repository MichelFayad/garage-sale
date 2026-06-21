// Untrusted-flag cron sweep. After one party confirms a trade, the other has a
// window (PlatformSetting.confirmationWindowDays, default 7) to confirm. If they
// miss it, the non-confirmer is flagged UNTRUSTED. No fee is involved here — the
// per-post fee was already collected at publish (P4).

import { DEFAULT_CONFIRMATION_WINDOW_DAYS, shouldFlagUntrusted } from '@garage-sale/core';
import { EmailType, ProposalStatus, TrustStatus, type PrismaClient } from '@garage-sale/db';
import { sendEmail } from './email.js';

async function confirmationWindowDays(prisma: PrismaClient): Promise<number> {
  const setting = await prisma.platformSetting.findUnique({
    where: { key: 'confirmationWindowDays' },
  });
  const value = setting?.value;
  return typeof value === 'number' ? value : DEFAULT_CONFIRMATION_WINDOW_DAYS;
}

export interface SweepResult {
  flagged: number;
}

/** Flag non-confirmers on accepted trades whose confirmation window has lapsed. */
export async function sweepUntrustedFlags(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<SweepResult> {
  const windowDays = await confirmationWindowDays(prisma);
  const accepted = await prisma.tradeProposal.findMany({
    where: { status: ProposalStatus.ACCEPTED },
    include: { confirmations: true },
  });

  let flagged = 0;
  for (const proposal of accepted) {
    const first = proposal.confirmations[0];
    const flag = shouldFlagUntrusted({
      confirmationCount: proposal.confirmations.length,
      firstConfirmedAt: first?.confirmedAt ?? null,
      now,
      windowDays,
    });
    if (!flag || !first) continue;

    const nonConfirmerId =
      first.userId === proposal.proposerId ? proposal.ownerId : proposal.proposerId;

    // Idempotent: one flag per (proposal, user).
    const existing = await prisma.untrustedFlag.findFirst({
      where: { proposalId: proposal.id, userId: nonConfirmerId },
    });
    if (existing) continue;

    await prisma.$transaction([
      prisma.untrustedFlag.create({
        data: {
          userId: nonConfirmerId,
          proposalId: proposal.id,
          reason: `No confirmation within ${windowDays} days of counterparty confirming`,
        },
      }),
      prisma.user.update({
        where: { id: nonConfirmerId },
        data: { trustStatus: TrustStatus.UNTRUSTED },
      }),
    ]);

    const user = await prisma.user.findUnique({
      where: { id: nonConfirmerId },
      select: { email: true },
    });
    if (user) {
      await sendEmail(prisma, {
        type: EmailType.UNTRUSTED_FLAG,
        toEmail: user.email,
        userId: nonConfirmerId,
        subject: 'Your account was flagged as untrusted',
        body: `You didn't confirm a trade within ${windowDays} days of the other trader confirming. Your account is now flagged Untrusted.`,
      });
    }
    flagged += 1;
  }

  return { flagged };
}
