// Listings router — Have/Want CRUD for traders, plus the public category list.
// Publishing (the per-post charge) lives in the billing router; this router owns
// drafting, editing, and lifecycle (mark-traded / remove). Editing a live listing
// is free (no re-charge) per the per-post pricing model.

import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { Condition, ListingStatus, ListingType, type PrismaClient } from '@garage-sale/db';
import { findProhibitedKeyword, MAX_LISTING_PHOTOS } from '@garage-sale/core';
import { protectedProcedure, publicProcedure, router } from '../trpc.js';

const listingInput = z.object({
  type: z.nativeEnum(ListingType),
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(2000),
  condition: z.nativeEnum(Condition),
  categoryId: z.string().min(1),
  city: z.string().max(120).optional(),
  neighbourhood: z.string().max(120).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  // For HAVE listings: what the owner wants in return.
  wantedDescription: z.string().max(2000).optional(),
  wantedCategoryId: z.string().min(1).optional(),
  photos: z.array(z.string().url()).max(MAX_LISTING_PHOTOS).default([]),
});

const listingInclude = {
  photos: { orderBy: { sortOrder: 'asc' } },
  category: true,
} as const;

function traderOnly(role: string) {
  if (role !== 'TRADER') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Trader account required' });
  }
}

/** Validate the category is enabled and screen text against its prohibited keywords. */
async function screenCategory(
  prisma: PrismaClient,
  categoryId: string,
  text: string,
): Promise<void> {
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category || !category.enabled) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid category' });
  }
  const hit = findProhibitedKeyword(text, category.prohibitedKeywords);
  if (hit) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: `Prohibited keyword: ${hit}` });
  }
}

export const listingsRouter = router({
  /** Enabled categories for selects. Public (used on browse + create). */
  categories: publicProcedure.query(({ ctx }) =>
    ctx.prisma.category.findMany({ where: { enabled: true }, orderBy: { sortOrder: 'asc' } }),
  ),

  /** The caller's own listings (any status), newest first. */
  mine: protectedProcedure.query(({ ctx }) => {
    traderOnly(ctx.principal.role);
    return ctx.prisma.listing.findMany({
      where: { ownerId: ctx.principal.userId },
      include: listingInclude,
      orderBy: { createdAt: 'desc' },
    });
  }),

  /** A single listing. Non-owners only see ACTIVE listings. */
  byId: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const listing = await ctx.prisma.listing.findUnique({
      where: { id: input.id },
      include: {
        ...listingInclude,
        owner: { select: { id: true, displayName: true, city: true } },
      },
    });
    if (!listing) throw new TRPCError({ code: 'NOT_FOUND' });
    const isOwner = listing.ownerId === ctx.principal.userId;
    if (!isOwner && listing.status !== ListingStatus.ACTIVE) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }
    return listing;
  }),

  /** Create a DRAFT listing. Publishing (charge) is a separate step. */
  create: protectedProcedure.input(listingInput).mutation(async ({ ctx, input }) => {
    traderOnly(ctx.principal.role);
    await screenCategory(ctx.prisma, input.categoryId, `${input.title} ${input.description}`);
    const { photos, ...data } = input;
    return ctx.prisma.listing.create({
      data: {
        ...data,
        ownerId: ctx.principal.userId,
        status: ListingStatus.DRAFT,
        photos: { create: photos.map((url, i) => ({ url, sortOrder: i })) },
      },
      include: listingInclude,
    });
  }),

  /** Edit a DRAFT or ACTIVE listing (editing live is free). Replaces photos. */
  update: protectedProcedure
    .input(listingInput.extend({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      traderOnly(ctx.principal.role);
      const existing = await ctx.prisma.listing.findUnique({ where: { id: input.id } });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });
      if (existing.ownerId !== ctx.principal.userId) throw new TRPCError({ code: 'FORBIDDEN' });
      if (existing.status !== ListingStatus.DRAFT && existing.status !== ListingStatus.ACTIVE) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This listing cannot be edited' });
      }
      await screenCategory(ctx.prisma, input.categoryId, `${input.title} ${input.description}`);
      const { id, photos, ...data } = input;
      // Replace photos wholesale to keep ordering simple.
      await ctx.prisma.listingPhoto.deleteMany({ where: { listingId: id } });
      return ctx.prisma.listing.update({
        where: { id },
        data: { ...data, photos: { create: photos.map((url, i) => ({ url, sortOrder: i })) } },
        include: listingInclude,
      });
    }),

  /** Mark an ACTIVE listing as traded (manual close; trade flow lands P6–P7). */
  markTraded: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      traderOnly(ctx.principal.role);
      const listing = await ctx.prisma.listing.findUnique({ where: { id: input.id } });
      if (!listing) throw new TRPCError({ code: 'NOT_FOUND' });
      if (listing.ownerId !== ctx.principal.userId) throw new TRPCError({ code: 'FORBIDDEN' });
      if (listing.status !== ListingStatus.ACTIVE) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only active listings can be traded' });
      }
      return ctx.prisma.listing.update({
        where: { id: input.id },
        data: { status: ListingStatus.COMPLETED },
        include: listingInclude,
      });
    }),

  /** Remove a listing (soft). Locked listings (in an accepted trade) cannot be removed. */
  remove: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      traderOnly(ctx.principal.role);
      const listing = await ctx.prisma.listing.findUnique({ where: { id: input.id } });
      if (!listing) throw new TRPCError({ code: 'NOT_FOUND' });
      if (listing.ownerId !== ctx.principal.userId) throw new TRPCError({ code: 'FORBIDDEN' });
      if (listing.status === ListingStatus.LOCKED) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Listing is locked in a trade' });
      }
      return ctx.prisma.listing.update({
        where: { id: input.id },
        data: { status: ListingStatus.REMOVED },
        include: listingInclude,
      });
    }),
});
