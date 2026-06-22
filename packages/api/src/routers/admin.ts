// Admin router (P9) — staff-only management surface. Every mutation writes an
// AuditLog row (see ../admin.ts) and is gated by role tier. adminProcedure has
// already proven the caller is non-TRADER staff; requireTier narrows further:
// SUPPORT (view + moderation queues) < OPERATIONS (users/listings/categories) <
// SUPER (fee, platform settings, admin accounts).

import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
  AccountStatus,
  AdminRole,
  ContentStatus,
  ListingStatus,
  ProposalStatus,
  ReportStatus,
  ReportTargetType,
  TrustStatus,
  UntrustedFlagStatus,
} from '@garage-sale/db';
import { hashPassword } from '@garage-sale/auth';
import { adminProcedure, router } from '../trpc.js';
import { audit, notifyAccountStatus, requireTier } from '../admin.js';
import { getServiceFeeCents } from '../billing.js';

const userSelect = {
  id: true,
  email: true,
  displayName: true,
  city: true,
  accountStatus: true,
  trustStatus: true,
  ratingAvg: true,
  ratingCount: true,
  createdAt: true,
} as const;

const pageInput = z.object({
  query: z.string().trim().max(120).optional(),
  take: z.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

/** Build the cursor clause shared by paged list endpoints. */
function paged(take: number, cursor?: string) {
  return {
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: 'desc' } as const,
  };
}

/** Split an over-fetched page into items + nextCursor. */
function split<T extends { id: string }>(
  rows: T[],
  take: number,
): { items: T[]; nextCursor: string | null } {
  if (rows.length > take) {
    const items = rows.slice(0, take);
    return { items, nextCursor: items[items.length - 1]?.id ?? null };
  }
  return { items: rows, nextCursor: null };
}

// ─── Users ──────────────────────────────────────────────────

const usersRouter = router({
  list: adminProcedure.input(pageInput).query(async ({ ctx, input }) => {
    const where = input.query
      ? {
          OR: [
            { email: { contains: input.query, mode: 'insensitive' as const } },
            { displayName: { contains: input.query, mode: 'insensitive' as const } },
          ],
        }
      : {};
    const rows = await ctx.prisma.user.findMany({
      where,
      select: userSelect,
      ...paged(input.take, input.cursor),
    });
    return split(rows, input.take);
  }),

  byId: adminProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { id: input.id },
      select: {
        ...userSelect,
        bio: true,
        neighbourhood: true,
        paymentValid: true,
        emailVerifiedAt: true,
        _count: { select: { listings: true, proposalsMade: true, proposalsReceived: true } },
        untrustedFlags: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    if (!user) throw new TRPCError({ code: 'NOT_FOUND' });
    return user;
  }),

  setAccountStatus: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        status: z.nativeEnum(AccountStatus),
        reason: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireTier(ctx.principal.role, 'OPERATIONS');
      const user = await ctx.prisma.user.update({
        where: { id: input.userId },
        data: { accountStatus: input.status },
        select: { id: true, email: true, accountStatus: true },
      });
      await audit(
        ctx.prisma,
        ctx.principal.userId,
        'User',
        user.id,
        `status:${input.status}`,
        input.reason,
      );
      await notifyAccountStatus(ctx.prisma, user, input.status, input.reason);
      return user;
    }),

  setTrustStatus: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        status: z.nativeEnum(TrustStatus),
        reason: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireTier(ctx.principal.role, 'OPERATIONS');
      const user = await ctx.prisma.user.update({
        where: { id: input.userId },
        data: { trustStatus: input.status },
        select: { id: true, trustStatus: true },
      });
      await audit(
        ctx.prisma,
        ctx.principal.userId,
        'User',
        user.id,
        `trust:${input.status}`,
        input.reason,
      );
      return user;
    }),
});

// ─── Listings ───────────────────────────────────────────────

const listingsRouter = router({
  list: adminProcedure
    .input(pageInput.extend({ status: z.nativeEnum(ListingStatus).optional() }))
    .query(async ({ ctx, input }) => {
      const where = {
        ...(input.status ? { status: input.status } : {}),
        ...(input.query ? { title: { contains: input.query, mode: 'insensitive' as const } } : {}),
      };
      const rows = await ctx.prisma.listing.findMany({
        where,
        include: {
          owner: { select: { id: true, displayName: true, email: true } },
          category: true,
        },
        ...paged(input.take, input.cursor),
      });
      return split(rows, input.take);
    }),

  remove: adminProcedure
    .input(z.object({ id: z.string(), reason: z.string().max(500) }))
    .mutation(async ({ ctx, input }) => {
      requireTier(ctx.principal.role, 'OPERATIONS');
      const listing = await ctx.prisma.listing.update({
        where: { id: input.id },
        data: { status: ListingStatus.REMOVED },
        select: { id: true, status: true },
      });
      await audit(ctx.prisma, ctx.principal.userId, 'Listing', listing.id, 'remove', input.reason);
      return listing;
    }),
});

// ─── Trades ─────────────────────────────────────────────────

const tradesRouter = router({
  list: adminProcedure
    .input(pageInput.extend({ status: z.nativeEnum(ProposalStatus).optional() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.prisma.tradeProposal.findMany({
        where: input.status ? { status: input.status } : {},
        include: {
          listing: { select: { id: true, title: true } },
          proposer: { select: { id: true, displayName: true } },
          owner: { select: { id: true, displayName: true } },
        },
        ...paged(input.take, input.cursor),
      });
      return split(rows, input.take);
    }),

  byId: adminProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const proposal = await ctx.prisma.tradeProposal.findUnique({
      where: { id: input.id },
      include: {
        listing: { select: { id: true, title: true } },
        proposer: { select: { id: true, displayName: true } },
        owner: { select: { id: true, displayName: true } },
        items: { include: { listing: { select: { id: true, title: true } } } },
        confirmations: true,
        ratings: true,
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { sender: { select: { displayName: true } } },
        },
      },
    });
    if (!proposal) throw new TRPCError({ code: 'NOT_FOUND' });
    return proposal;
  }),
});

// ─── Fee config (versioned) ─────────────────────────────────

const feeRouter = router({
  current: adminProcedure.query(async ({ ctx }) => ({
    amountCents: await getServiceFeeCents(ctx.prisma),
  })),

  history: adminProcedure.query(({ ctx }) =>
    ctx.prisma.serviceFeeConfig.findMany({
      orderBy: { effectiveFrom: 'desc' },
      include: { changedByAdmin: { select: { displayName: true } } },
    }),
  ),

  set: adminProcedure
    .input(z.object({ amountCents: z.number().int().min(0).max(100_000) }))
    .mutation(async ({ ctx, input }) => {
      requireTier(ctx.principal.role, 'SUPER');
      const config = await ctx.prisma.serviceFeeConfig.create({
        data: { amountCents: input.amountCents, changedByAdminId: ctx.principal.userId },
      });
      await audit(
        ctx.prisma,
        ctx.principal.userId,
        'ServiceFeeConfig',
        config.id,
        `set:${input.amountCents}`,
      );
      return config;
    }),
});

// ─── Categories ─────────────────────────────────────────────

const categoriesRouter = router({
  list: adminProcedure.query(({ ctx }) =>
    ctx.prisma.category.findMany({ orderBy: { sortOrder: 'asc' } }),
  ),

  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(80),
        sortOrder: z.number().int().default(0),
        prohibitedKeywords: z.array(z.string().min(1).max(60)).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireTier(ctx.principal.role, 'OPERATIONS');
      const category = await ctx.prisma.category.create({ data: input });
      await audit(ctx.prisma, ctx.principal.userId, 'Category', category.id, 'create');
      return category;
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(80).optional(),
        sortOrder: z.number().int().optional(),
        enabled: z.boolean().optional(),
        prohibitedKeywords: z.array(z.string().min(1).max(60)).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireTier(ctx.principal.role, 'OPERATIONS');
      const { id, ...data } = input;
      const category = await ctx.prisma.category.update({ where: { id }, data });
      await audit(ctx.prisma, ctx.principal.userId, 'Category', id, 'update');
      return category;
    }),
});

// ─── Reports queue ──────────────────────────────────────────

const reportsRouter = router({
  list: adminProcedure
    .input(z.object({ status: z.nativeEnum(ReportStatus).default(ReportStatus.OPEN) }))
    .query(({ ctx, input }) =>
      ctx.prisma.report.findMany({
        where: { status: input.status },
        include: { reporter: { select: { id: true, displayName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ),

  /** Resolve target context (listing title / user name) for an open report. */
  target: adminProcedure
    .input(z.object({ targetType: z.nativeEnum(ReportTargetType), targetId: z.string() }))
    .query(async ({ ctx, input }) => {
      if (input.targetType === ReportTargetType.LISTING) {
        const l = await ctx.prisma.listing.findUnique({
          where: { id: input.targetId },
          select: { id: true, title: true, status: true },
        });
        return { kind: 'LISTING' as const, listing: l };
      }
      const u = await ctx.prisma.user.findUnique({
        where: { id: input.targetId },
        select: { id: true, displayName: true, accountStatus: true },
      });
      return { kind: 'USER' as const, user: u };
    }),

  resolve: adminProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.enum([ReportStatus.RESOLVED, ReportStatus.DISMISSED]),
        reason: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireTier(ctx.principal.role, 'SUPPORT');
      const report = await ctx.prisma.report.update({
        where: { id: input.id },
        data: { status: input.status, handledByAdminId: ctx.principal.userId },
        select: { id: true, status: true },
      });
      await audit(
        ctx.prisma,
        ctx.principal.userId,
        'Report',
        report.id,
        `resolve:${input.status}`,
        input.reason,
      );
      return report;
    }),
});

// ─── Untrusted-flag review ──────────────────────────────────

const flagsRouter = router({
  list: adminProcedure
    .input(
      z.object({ status: z.nativeEnum(UntrustedFlagStatus).default(UntrustedFlagStatus.ACTIVE) }),
    )
    .query(({ ctx, input }) =>
      ctx.prisma.untrustedFlag.findMany({
        where: { status: input.status },
        include: {
          user: { select: { id: true, displayName: true, trustStatus: true } },
          proposal: { select: { id: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ),

  review: adminProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.enum([UntrustedFlagStatus.CLEARED, UntrustedFlagStatus.ESCALATED]),
        reason: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireTier(ctx.principal.role, 'SUPPORT');
      const flag = await ctx.prisma.untrustedFlag.update({
        where: { id: input.id },
        data: {
          status: input.status,
          reviewedByAdminId: ctx.principal.userId,
          resolvedAt: new Date(),
        },
        select: { id: true, userId: true, status: true },
      });
      // Clearing the last active flag restores the trader's TRUSTED standing.
      if (input.status === UntrustedFlagStatus.CLEARED) {
        const remaining = await ctx.prisma.untrustedFlag.count({
          where: { userId: flag.userId, status: UntrustedFlagStatus.ACTIVE },
        });
        if (remaining === 0) {
          await ctx.prisma.user.update({
            where: { id: flag.userId },
            data: { trustStatus: TrustStatus.TRUSTED },
          });
        }
      }
      await audit(
        ctx.prisma,
        ctx.principal.userId,
        'UntrustedFlag',
        flag.id,
        `review:${input.status}`,
        input.reason,
      );
      return flag;
    }),
});

// ─── Platform settings ──────────────────────────────────────

const settingsRouter = router({
  list: adminProcedure.query(({ ctx }) =>
    ctx.prisma.platformSetting.findMany({ orderBy: { key: 'asc' } }),
  ),

  set: adminProcedure
    .input(z.object({ key: z.string().min(1).max(80), value: z.any() }))
    .mutation(async ({ ctx, input }) => {
      requireTier(ctx.principal.role, 'SUPER');
      const setting = await ctx.prisma.platformSetting.upsert({
        where: { key: input.key },
        create: { key: input.key, value: input.value, updatedByAdminId: ctx.principal.userId },
        update: { value: input.value, updatedByAdminId: ctx.principal.userId },
      });
      await audit(
        ctx.prisma,
        ctx.principal.userId,
        'PlatformSetting',
        setting.id,
        `set:${input.key}`,
      );
      return setting;
    }),
});

// ─── Admin accounts & roles ─────────────────────────────────

const adminsRouter = router({
  list: adminProcedure.query(({ ctx }) => {
    requireTier(ctx.principal.role, 'SUPER');
    return ctx.prisma.adminUser.findMany({
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        accountStatus: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }),

  create: adminProcedure
    .input(
      z.object({
        email: z.string().email(),
        displayName: z.string().min(1).max(120),
        role: z.nativeEnum(AdminRole),
        password: z.string().min(10).max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireTier(ctx.principal.role, 'SUPER');
      const exists = await ctx.prisma.adminUser.findUnique({ where: { email: input.email } });
      if (exists) throw new TRPCError({ code: 'CONFLICT', message: 'Email already in use' });
      const admin = await ctx.prisma.adminUser.create({
        data: {
          email: input.email,
          displayName: input.displayName,
          role: input.role,
          passwordHash: await hashPassword(input.password),
        },
        select: { id: true, email: true, displayName: true, role: true },
      });
      await audit(ctx.prisma, ctx.principal.userId, 'AdminUser', admin.id, `create:${input.role}`);
      return admin;
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.string(),
        role: z.nativeEnum(AdminRole).optional(),
        accountStatus: z.nativeEnum(AccountStatus).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireTier(ctx.principal.role, 'SUPER');
      if (
        input.id === ctx.principal.userId &&
        input.accountStatus &&
        input.accountStatus !== AccountStatus.ACTIVE
      ) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot disable your own account' });
      }
      const { id, ...data } = input;
      const admin = await ctx.prisma.adminUser.update({
        where: { id },
        data,
        select: { id: true, role: true, accountStatus: true },
      });
      await audit(ctx.prisma, ctx.principal.userId, 'AdminUser', id, 'update');
      return admin;
    }),
});

// ─── CMS content pages (P10) ────────────────────────────────

const contentRouter = router({
  // Staff (incl. SUPPORT) can view all pages — drafts and published.
  list: adminProcedure.query(({ ctx }) =>
    ctx.prisma.contentPage.findMany({
      orderBy: { updatedAt: 'desc' },
      select: { id: true, slug: true, title: true, status: true, updatedAt: true },
    }),
  ),

  byId: adminProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const page = await ctx.prisma.contentPage.findUnique({ where: { id: input.id } });
    if (!page) throw new TRPCError({ code: 'NOT_FOUND' });
    return page;
  }),

  create: adminProcedure
    .input(
      z.object({
        slug: z
          .string()
          .min(1)
          .max(120)
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase, digits, and hyphens only'),
        title: z.string().min(1).max(200),
        description: z.string().max(300).optional(),
        body: z.string().max(50_000),
        status: z.nativeEnum(ContentStatus).default(ContentStatus.DRAFT),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireTier(ctx.principal.role, 'OPERATIONS');
      const exists = await ctx.prisma.contentPage.findUnique({ where: { slug: input.slug } });
      if (exists) throw new TRPCError({ code: 'CONFLICT', message: 'Slug already in use' });
      const page = await ctx.prisma.contentPage.create({
        data: { ...input, updatedByAdminId: ctx.principal.userId },
      });
      await audit(ctx.prisma, ctx.principal.userId, 'ContentPage', page.id, `create:${page.slug}`);
      return page;
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).max(200).optional(),
        description: z.string().max(300).optional(),
        body: z.string().max(50_000).optional(),
        status: z.nativeEnum(ContentStatus).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireTier(ctx.principal.role, 'OPERATIONS');
      const { id, ...data } = input;
      const page = await ctx.prisma.contentPage.update({
        where: { id },
        data: { ...data, updatedByAdminId: ctx.principal.userId },
      });
      await audit(ctx.prisma, ctx.principal.userId, 'ContentPage', id, `update:${page.status}`);
      return page;
    }),

  delete: adminProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    requireTier(ctx.principal.role, 'OPERATIONS');
    const page = await ctx.prisma.contentPage.delete({
      where: { id: input.id },
      select: { id: true, slug: true },
    });
    await audit(ctx.prisma, ctx.principal.userId, 'ContentPage', page.id, `delete:${page.slug}`);
    return page;
  }),
});

// ─── Audit log viewer ───────────────────────────────────────

const auditRouter = router({
  list: adminProcedure
    .input(
      pageInput
        .pick({ take: true, cursor: true })
        .extend({ entityType: z.string().optional(), entityId: z.string().optional() }),
    )
    .query(async ({ ctx, input }) => {
      requireTier(ctx.principal.role, 'OPERATIONS');
      const where = {
        ...(input.entityType ? { entityType: input.entityType } : {}),
        ...(input.entityId ? { entityId: input.entityId } : {}),
      };
      const rows = await ctx.prisma.auditLog.findMany({
        where,
        include: { admin: { select: { displayName: true, role: true } } },
        ...paged(input.take, input.cursor),
      });
      return split(rows, input.take);
    }),
});

export const adminRouter = router({
  users: usersRouter,
  listings: listingsRouter,
  trades: tradesRouter,
  fee: feeRouter,
  categories: categoriesRouter,
  reports: reportsRouter,
  flags: flagsRouter,
  settings: settingsRouter,
  admins: adminsRouter,
  content: contentRouter,
  audit: auditRouter,
});
