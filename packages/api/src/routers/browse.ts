// Browse router — public discovery of ACTIVE listings with keyword, category,
// condition, type, and location-radius filters. Radius filtering is done in app
// (haversine) since the DB has no PostGIS; fine for the expected catalogue size.

import { z } from 'zod';
import { Condition, ListingStatus, ListingType } from '@garage-sale/db';
import { haversineKm } from '@garage-sale/core';
import { protectedProcedure, router } from '../trpc.js';

const browseInput = z.object({
  keyword: z.string().max(120).optional(),
  categoryId: z.string().optional(),
  condition: z.nativeEnum(Condition).optional(),
  type: z.nativeEnum(ListingType).optional(),
  // Location radius: all three required together.
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  radiusKm: z.number().positive().max(20000).optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export const browseRouter = router({
  search: protectedProcedure.input(browseInput).query(async ({ ctx, input }) => {
    const useRadius =
      input.lat !== undefined && input.lng !== undefined && input.radiusKm !== undefined;

    const listings = await ctx.prisma.listing.findMany({
      where: {
        status: ListingStatus.ACTIVE,
        ownerId: { not: ctx.principal.userId }, // hide own listings from browse
        categoryId: input.categoryId,
        condition: input.condition,
        type: input.type,
        ...(input.keyword
          ? {
              OR: [
                { title: { contains: input.keyword, mode: 'insensitive' } },
                { description: { contains: input.keyword, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(useRadius ? { lat: { not: null }, lng: { not: null } } : {}),
      },
      include: { photos: { orderBy: { sortOrder: 'asc' }, take: 1 }, category: true },
      orderBy: { publishedAt: 'desc' },
      // Over-fetch when filtering by radius so the post-filter still fills the page.
      take: useRadius ? Math.min(input.limit * 4, 400) : input.limit,
    });

    if (!useRadius) return listings.map((l) => ({ ...l, distanceKm: null as number | null }));

    const { lat, lng, radiusKm } = input as { lat: number; lng: number; radiusKm: number };
    return listings
      .map((l) => ({ ...l, distanceKm: haversineKm(lat, lng, l.lat!, l.lng!) }))
      .filter((l) => l.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, input.limit);
  }),
});
