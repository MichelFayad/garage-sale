// Admin service helpers: an append-only audit trail for every staff mutation,
// role-based gating (SUPER > OPERATIONS > SUPPORT), and the account-status email
// notifications (suspend/ban) deferred from P8. The admin principal's userId is
// an AdminUser.id (see auth.adminLogin), so it maps straight onto AuditLog.adminId.

import { TRPCError } from '@trpc/server';
import { AccountStatus, EmailType, type PrismaClient } from '@garage-sale/db';
import type { Role } from '@garage-sale/auth';
import { sendEmail } from './email.js';

/** Capability tiers. Higher tiers inherit everything below them. */
const ROLE_RANK = { SUPPORT: 1, OPERATIONS: 2, SUPER: 3 } as const;
type Tier = keyof typeof ROLE_RANK;

/** Throw FORBIDDEN unless the caller's role meets the minimum tier. */
export function requireTier(role: Role, min: Tier): void {
  if ((ROLE_RANK[role as Tier] ?? 0) < ROLE_RANK[min]) {
    throw new TRPCError({ code: 'FORBIDDEN', message: `Requires ${min} role` });
  }
}

/** Record one staff action against an entity (append-only). */
export async function audit(
  prisma: PrismaClient,
  adminId: string,
  entityType: string,
  entityId: string,
  action: string,
  reason?: string | null,
): Promise<void> {
  await prisma.auditLog.create({
    data: { adminId, entityType, entityId, action, reason: reason ?? null },
  });
}

/** Email the trader when staff suspend or ban their account. No-op otherwise. */
export async function notifyAccountStatus(
  prisma: PrismaClient,
  user: { id: string; email: string },
  status: AccountStatus,
  reason?: string | null,
): Promise<void> {
  if (status === AccountStatus.SUSPENDED) {
    await sendEmail(prisma, {
      type: EmailType.ACCOUNT_SUSPENDED,
      toEmail: user.email,
      userId: user.id,
      subject: 'Your Garage Sale account has been suspended',
      body: `Your account has been suspended${reason ? `: ${reason}` : '.'} You can't post or trade while suspended. Reply to this email to appeal.`,
    });
  } else if (status === AccountStatus.BANNED) {
    await sendEmail(prisma, {
      type: EmailType.ACCOUNT_BANNED,
      toEmail: user.email,
      userId: user.id,
      subject: 'Your Garage Sale account has been banned',
      body: `Your account has been permanently banned${reason ? `: ${reason}` : '.'} This decision is final.`,
    });
  }
}
