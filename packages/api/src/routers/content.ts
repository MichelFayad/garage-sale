// Public CMS read surface (P10). Exposes only PUBLISHED ContentPages — drafts are
// invisible to the marketing site and the sitemap. Authoring lives under
// appRouter.admin.content (staff-only). Output types are inline/structural so the
// browser client can infer them (see TS2742 gotcha).

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { publicProcedure, router } from '../trpc.js';

export const contentRouter = router({
  /** Published pages, newest first — drives the footer nav + sitemap. */
  published: publicProcedure.query(({ ctx }) =>
    ctx.prisma.contentPage.findMany({
      where: { status: 'PUBLISHED' },
      select: { slug: true, title: true, updatedAt: true },
      orderBy: { title: 'asc' },
    }),
  ),

  /** One published page by slug, or NOT_FOUND (drafts read as missing). */
  bySlug: publicProcedure
    .input(z.object({ slug: z.string().min(1).max(120) }))
    .query(async ({ ctx, input }) => {
      const page = await ctx.prisma.contentPage.findFirst({
        where: { slug: input.slug, status: 'PUBLISHED' },
        select: { slug: true, title: true, description: true, body: true, updatedAt: true },
      });
      if (!page) throw new TRPCError({ code: 'NOT_FOUND' });
      return page;
    }),
});
