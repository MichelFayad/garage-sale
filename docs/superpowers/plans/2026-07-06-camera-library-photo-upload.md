# Camera/Library Photo Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace manual photo-URL text entry with real camera/library upload on web and mobile, backed by Vercel Blob, without changing the `ListingPhoto.url` data model.

**Architecture:** A new `packages/api` `uploads` router mints short-lived, path-scoped Vercel Blob client tokens (`protectedProcedure`, rate-limited per user); web and mobile compress the image client-side and upload directly to Blob with that token via `@vercel/blob/client`'s `upload()`. The resulting URL is pushed into the listing form's existing `photos: string[]` state — `listings.create`/`update` are untouched downstream. Removed photos are best-effort deleted from Blob.

**Tech Stack:** Vercel Blob (`@vercel/blob`), `expo-image-picker` + `expo-image-manipulator` (mobile), canvas resize (web), existing tRPC v11 + Zod + vitest conventions.

**Design doc:** `docs/superpowers/specs/2026-07-06-camera-library-photo-upload-design.md`

**Correction vs. the design doc:** the design doc suggested cleanup could be needed on listing *removal* too. `listings.remove` (`packages/api/src/routers/listings.ts:145-160`) is a **soft** delete — it flips `status` to `REMOVED` and keeps the `ListingPhoto` rows (the owner can still see them). Only `listings.update`'s wholesale photo-replace actually discards `ListingPhoto` rows, so that's the only place Blob cleanup is wired in. No further removal-path hook is needed.

---

### Task 1: Core — photo upload constants, pure helpers, rate-limit preset

**Files:**
- Modify: `packages/core/src/constants.ts`
- Create: `packages/core/src/upload.ts`
- Create: `packages/core/src/upload.test.ts`
- Modify: `packages/core/src/ratelimit.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Add the upload size constant**

Append to `packages/core/src/constants.ts`:

```ts
/** Max accepted size (bytes) for a single photo upload, post client-side compression. */
export const MAX_PHOTO_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB
```

- [ ] **Step 2: Write the failing tests for the new pure helpers**

Create `packages/core/src/upload.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  extensionForContentType,
  isAllowedPhotoContentType,
  photoPathBelongsToUser,
  photoPathPrefix,
} from './upload.js';

describe('isAllowedPhotoContentType', () => {
  it('accepts jpeg/png/webp', () => {
    expect(isAllowedPhotoContentType('image/jpeg')).toBe(true);
    expect(isAllowedPhotoContentType('image/png')).toBe(true);
    expect(isAllowedPhotoContentType('image/webp')).toBe(true);
  });
  it('rejects anything else', () => {
    expect(isAllowedPhotoContentType('image/gif')).toBe(false);
    expect(isAllowedPhotoContentType('application/pdf')).toBe(false);
  });
});

describe('extensionForContentType', () => {
  it('maps each allowed type to its extension', () => {
    expect(extensionForContentType('image/jpeg')).toBe('jpg');
    expect(extensionForContentType('image/png')).toBe('png');
    expect(extensionForContentType('image/webp')).toBe('webp');
  });
});

describe('photoPathPrefix', () => {
  it('builds the expected prefix', () => {
    expect(photoPathPrefix('u1')).toBe('listings/u1/');
  });
});

describe('photoPathBelongsToUser', () => {
  it('accepts a path under the user prefix', () => {
    expect(photoPathBelongsToUser('listings/u1/abc.jpg', 'u1')).toBe(true);
  });
  it("rejects another user's path", () => {
    expect(photoPathBelongsToUser('listings/u2/abc.jpg', 'u1')).toBe(false);
  });
  it('rejects a path with no prefix match', () => {
    expect(photoPathBelongsToUser('other/u1/abc.jpg', 'u1')).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @garage-sale/core test`
Expected: FAIL — `Cannot find module './upload.js'`

- [ ] **Step 4: Implement the helpers**

Create `packages/core/src/upload.ts`:

```ts
// Photo upload helpers: the content-type allowlist and the ownership check
// used to verify a Blob pathname belongs to the caller before deleting it.
// Pure functions reused by the API (enforcement) and, for the allowlist, by
// clients for pre-validation before they even request an upload token.

export const ALLOWED_PHOTO_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AllowedPhotoContentType = (typeof ALLOWED_PHOTO_CONTENT_TYPES)[number];

export function isAllowedPhotoContentType(
  contentType: string,
): contentType is AllowedPhotoContentType {
  return (ALLOWED_PHOTO_CONTENT_TYPES as readonly string[]).includes(contentType);
}

const EXTENSIONS: Record<AllowedPhotoContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** File extension for a validated content type. */
export function extensionForContentType(contentType: AllowedPhotoContentType): string {
  return EXTENSIONS[contentType];
}

/** Blob pathname prefix every upload for `userId` must live under. */
export function photoPathPrefix(userId: string): string {
  return `listings/${userId}/`;
}

/** Whether a Blob pathname (or a full URL's pathname, sans leading slash) belongs to `userId`. */
export function photoPathBelongsToUser(pathname: string, userId: string): boolean {
  return pathname.startsWith(photoPathPrefix(userId));
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @garage-sale/core test`
Expected: PASS (all `upload.test.ts` cases green)

- [ ] **Step 6: Add the rate-limit preset**

In `packages/core/src/ratelimit.ts`, modify the `RATE_LIMITS` object:

```ts
export const RATE_LIMITS = {
  /** Login attempts (credentials brute-force guard). */
  login: { limit: 10, windowMs: 15 * MINUTE },
  /** Account creation. */
  register: { limit: 5, windowMs: 60 * MINUTE },
  /** Email-bearing actions (reset/verification re-send) — abuse + spam guard. */
  emailLink: { limit: 5, windowMs: 60 * MINUTE },
  /** Photo upload token minting — bounds storage-cost abuse. */
  photoUpload: { limit: 30, windowMs: 60 * MINUTE },
} as const satisfies Record<string, RateLimitConfig>;
```

- [ ] **Step 7: Export the new module**

In `packages/core/src/index.ts`, add:

```ts
export * from './upload.js';
```

(Keep alphabetical placement — the existing order is `constants, fee, listing, ratelimit, roles, trust`; `upload` sorts after `trust`, so append it as the new last line.)

- [ ] **Step 8: Run the full core test suite**

Run: `pnpm --filter @garage-sale/core test`
Expected: PASS, no regressions in `fee.test.ts` / `trust.test.ts` / `listing.test.ts` / `ratelimit.test.ts`

- [ ] **Step 9: Typecheck**

Run: `pnpm --filter @garage-sale/core typecheck`
Expected: no errors

- [ ] **Step 10: Commit**

```bash
git add packages/core/src/constants.ts packages/core/src/upload.ts packages/core/src/upload.test.ts packages/core/src/ratelimit.ts packages/core/src/index.ts
git commit -m "feat(core): add photo-upload constants, pure helpers, rate-limit preset"
```

---

### Task 2: API — Vercel Blob service module

**Files:**
- Modify: `packages/api/package.json`
- Create: `packages/api/src/upload.ts`

- [ ] **Step 1: Add the dependency**

Run: `pnpm add --filter @garage-sale/api @vercel/blob`
Expected: `@vercel/blob` appears under `dependencies` in `packages/api/package.json`

- [ ] **Step 2: Write the service module**

Create `packages/api/src/upload.ts`:

```ts
// Photo upload service — Vercel Blob. Mints short-lived, path-scoped client
// tokens so uploads go directly from the browser/app to Blob storage (the
// server never sees the file bytes), and best-effort deletes objects that are
// no longer referenced by a listing. Delete failures are swallowed, mirroring
// push.ts/email.ts: a cleanup hiccup must never break the mutation that
// triggered it.

import { randomUUID } from 'node:crypto';
import { del } from '@vercel/blob';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import { TRPCError } from '@trpc/server';
import {
  extensionForContentType,
  isAllowedPhotoContentType,
  MAX_PHOTO_UPLOAD_BYTES,
  photoPathPrefix,
} from '@garage-sale/core';

export interface UploadToken {
  token: string;
  pathname: string;
}

/** Mint a client token scoped to a fresh path under the caller's own prefix. */
export async function createUploadToken(
  userId: string,
  contentType: string,
): Promise<UploadToken> {
  if (!isAllowedPhotoContentType(contentType)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unsupported image type' });
  }
  const pathname = `${photoPathPrefix(userId)}${randomUUID()}.${extensionForContentType(contentType)}`;
  const token = await generateClientTokenFromReadWriteToken({
    pathname,
    allowedContentTypes: [contentType],
    maximumSizeInBytes: MAX_PHOTO_UPLOAD_BYTES,
    addRandomSuffix: false,
  });
  return { token, pathname };
}

/** Best-effort delete of one or more Blob URLs. Never throws. */
export async function deleteBlobFiles(urls: string[]): Promise<void> {
  if (urls.length === 0) return;
  try {
    await del(urls);
  } catch {
    // Swallow — cleanup failure must not break the caller's mutation.
  }
}
```

- [ ] **Step 3: Typecheck against the installed SDK types**

Run: `pnpm --filter @garage-sale/api typecheck`
Expected: PASS. If `generateClientTokenFromReadWriteToken`'s option names differ from above, TS will flag it — open `node_modules/@vercel/blob/dist/client.d.mts` (or `.d.ts`), match the field names exactly (the scoping behavior — one fresh `pathname` per upload, capped size, single allowed content type — must be preserved), and re-run.

- [ ] **Step 4: Commit**

```bash
git add packages/api/package.json packages/api/src/upload.ts
git commit -m "feat(api): add Vercel Blob upload service (token mint + best-effort delete)"
```

---

### Task 3: API — uploads router

**Files:**
- Modify: `packages/api/src/ratelimit.ts`
- Create: `packages/api/src/routers/uploads.ts`
- Modify: `packages/api/src/root.ts`

- [ ] **Step 1: Register the new limiter**

In `packages/api/src/ratelimit.ts`, modify the `limiters` record:

```ts
const limiters: Record<RateLimitName, InMemoryRateLimiter> = {
  login: new InMemoryRateLimiter(RATE_LIMITS.login),
  register: new InMemoryRateLimiter(RATE_LIMITS.register),
  emailLink: new InMemoryRateLimiter(RATE_LIMITS.emailLink),
  photoUpload: new InMemoryRateLimiter(RATE_LIMITS.photoUpload),
};
```

And update the file's header comment (first line) to note it's also used with non-IP keys:

```ts
// API-side rate limiting — holds the limiter singletons (one per named preset)
// and a helper that throws TOO_MANY_REQUESTS. Most presets are keyed by client
// IP (auth-sensitive, unauthenticated surfaces); authenticated surfaces (e.g.
// photo upload) key by userId instead — enforceRateLimit takes any string key.
```

- [ ] **Step 2: Write the router**

Create `packages/api/src/routers/uploads.ts`:

```ts
// Uploads router — mints short-lived Vercel Blob client tokens for direct
// browser/app uploads and cleans up removed photos. All procedures require an
// authenticated trader; rate-limited per user to bound storage-cost abuse.

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { photoPathBelongsToUser } from '@garage-sale/core';
import { protectedProcedure, router } from '../trpc.js';
import { createUploadToken, deleteBlobFiles } from '../upload.js';
import { enforceRateLimit } from '../ratelimit.js';

export const uploadsRouter = router({
  createUploadToken: protectedProcedure
    .input(z.object({ contentType: z.string() }))
    .mutation(async ({ ctx, input }) => {
      enforceRateLimit('photoUpload', ctx.principal.userId);
      return createUploadToken(ctx.principal.userId, input.contentType);
    }),

  deleteFile: protectedProcedure
    .input(z.object({ url: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      const pathname = new URL(input.url).pathname.replace(/^\//, '');
      if (!photoPathBelongsToUser(pathname, ctx.principal.userId)) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      await deleteBlobFiles([input.url]);
      return { ok: true };
    }),
});
```

- [ ] **Step 3: Mount the router**

Modify `packages/api/src/root.ts` — add the import and mount point:

```ts
import { router } from './trpc.js';
import { healthRouter } from './routers/health.js';
import { authRouter } from './routers/auth.js';
import { oauthRouter } from './routers/oauth.js';
import { billingRouter } from './routers/billing.js';
import { listingsRouter } from './routers/listings.js';
import { browseRouter } from './routers/browse.js';
import { watchlistRouter } from './routers/watchlist.js';
import { tradesRouter } from './routers/trades.js';
import { blocksRouter } from './routers/blocks.js';
import { contentRouter } from './routers/content.js';
import { pushRouter } from './routers/push.js';
import { uploadsRouter } from './routers/uploads.js';
import { adminRouter } from './routers/admin.js';

// Root router — trade/messaging routers are added P6+; admin lands P9.
export const appRouter = router({
  health: healthRouter,
  auth: authRouter,
  oauth: oauthRouter,
  billing: billingRouter,
  listings: listingsRouter,
  browse: browseRouter,
  watchlist: watchlistRouter,
  trades: tradesRouter,
  blocks: blocksRouter,
  content: contentRouter,
  push: pushRouter,
  uploads: uploadsRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @garage-sale/api typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/ratelimit.ts packages/api/src/routers/uploads.ts packages/api/src/root.ts
git commit -m "feat(api): add uploads router (token mint + delete), mount on appRouter"
```

---

### Task 4: API — uploads router tests

**Files:**
- Create: `packages/api/src/routers/uploads.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/api/src/routers/uploads.test.ts`:

```ts
// Uploads router tests — mocked Blob SDK, no real network calls. Exercises the
// auth guard, content-type validation, ownership check, and the per-user rate
// limit, mirroring the style of auth.test.ts.

import { describe, expect, it, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { appRouter } from '../root.js';
import type { Context } from '../trpc.js';

vi.mock('@vercel/blob', () => ({ del: vi.fn(async () => {}) }));
vi.mock('@vercel/blob/client', () => ({
  generateClientTokenFromReadWriteToken: vi.fn(async () => 'fake-token'),
}));

function caller(principal: Context['principal']) {
  const ctx = { prisma: {}, principal, ip: null } as unknown as Context;
  return appRouter.createCaller(ctx);
}

async function codeOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof TRPCError) return err.code;
    throw err;
  }
  throw new Error('expected the call to throw');
}

const trader = { userId: 'u1', role: 'TRADER', accountStatus: 'ACTIVE' } as const;

describe('uploads.createUploadToken', () => {
  it('requires authentication', async () => {
    const code = await codeOf(() =>
      caller(null).uploads.createUploadToken({ contentType: 'image/jpeg' }),
    );
    expect(code).toBe('UNAUTHORIZED');
  });

  it('rejects an unsupported content type', async () => {
    const code = await codeOf(() =>
      caller(trader).uploads.createUploadToken({ contentType: 'image/gif' }),
    );
    expect(code).toBe('BAD_REQUEST');
  });

  it("mints a token scoped under the caller's own path", async () => {
    const result = await caller(trader).uploads.createUploadToken({ contentType: 'image/jpeg' });
    expect(result.pathname.startsWith('listings/u1/')).toBe(true);
    expect(result.pathname.endsWith('.jpg')).toBe(true);
  });

  it('throws TOO_MANY_REQUESTS after the per-user limit', async () => {
    // Unique userId so the per-process limiter state can't be tripped by other tests.
    const limited = { userId: 'rate-limit-user', role: 'TRADER', accountStatus: 'ACTIVE' } as const;
    const codes: string[] = [];
    for (let i = 0; i < 31; i++) {
      try {
        await caller(limited).uploads.createUploadToken({ contentType: 'image/jpeg' });
        codes.push('OK');
      } catch (err) {
        codes.push(err instanceof TRPCError ? err.code : 'ERROR');
      }
    }
    expect(codes.slice(0, 30).every((c) => c === 'OK')).toBe(true);
    expect(codes[30]).toBe('TOO_MANY_REQUESTS');
  });
});

describe('uploads.deleteFile', () => {
  it('requires authentication', async () => {
    const code = await codeOf(() =>
      caller(null).uploads.deleteFile({ url: 'https://blob.example/listings/u1/a.jpg' }),
    );
    expect(code).toBe('UNAUTHORIZED');
  });

  it("rejects a URL outside the caller's own path", async () => {
    const code = await codeOf(() =>
      caller(trader).uploads.deleteFile({ url: 'https://blob.example/listings/u2/a.jpg' }),
    );
    expect(code).toBe('FORBIDDEN');
  });

  it("allows deleting the caller's own file", async () => {
    const result = await caller(trader).uploads.deleteFile({
      url: 'https://blob.example/listings/u1/a.jpg',
    });
    expect(result).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `pnpm --filter @garage-sale/api test`
Expected: PASS — all `uploads.test.ts` cases green, no regressions in `auth.test.ts` / `billing.test.ts`

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/routers/uploads.test.ts
git commit -m "test(api): cover uploads router auth guard, validation, ownership, rate limit"
```

---

### Task 5: API — wire Blob cleanup into `listings.update`

**Files:**
- Modify: `packages/api/src/routers/listings.ts:104-124`
- Create: `packages/api/src/routers/listings.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/api/src/routers/listings.test.ts`:

```ts
// listings.update photo-cleanup test — mocked Prisma + mocked upload service.
// Verifies that removed photos belonging to the caller's own Blob prefix get
// deleted, while an unrelated (pre-existing, non-Blob) URL is left alone.

import { describe, expect, it, vi } from 'vitest';

vi.mock('../upload.js', () => ({ deleteBlobFiles: vi.fn(async () => {}) }));

import { appRouter } from '../root.js';
import type { Context } from '../trpc.js';
import { deleteBlobFiles } from '../upload.js';

function caller(prisma: Record<string, unknown>) {
  const ctx = {
    prisma,
    principal: { userId: 'u1', role: 'TRADER', accountStatus: 'ACTIVE' },
    ip: null,
  } as unknown as Context;
  return appRouter.createCaller(ctx);
}

describe('listings.update photo cleanup', () => {
  it('deletes only the removed photos that are under the owner Blob prefix', async () => {
    const prisma = {
      listing: {
        findUnique: async () => ({
          id: 'l1',
          ownerId: 'u1',
          status: 'DRAFT',
          photos: [
            { url: 'https://blob.example/listings/u1/a.jpg' },
            { url: 'https://blob.example/listings/u1/b.jpg' },
            { url: 'https://example.com/external.jpg' },
          ],
        }),
        update: async ({ data }: { data: Record<string, unknown> }) => ({ id: 'l1', ...data }),
      },
      listingPhoto: { deleteMany: async () => ({ count: 3 }) },
      category: { findUnique: async () => ({ id: 'c1', enabled: true, prohibitedKeywords: [] }) },
    };

    await caller(prisma).listings.update({
      id: 'l1',
      type: 'HAVE',
      title: 't',
      description: 'd',
      condition: 'GOOD',
      categoryId: 'c1',
      photos: ['https://blob.example/listings/u1/a.jpg'],
    });

    // 'b.jpg' was removed and is under u1's Blob prefix -> deleted.
    // The external URL was also removed but isn't a Blob URL -> left alone.
    expect(deleteBlobFiles).toHaveBeenCalledWith(['https://blob.example/listings/u1/b.jpg']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @garage-sale/api test -- listings.test.ts`
Expected: FAIL — `deleteBlobFiles` not called (the wiring doesn't exist yet), or `existing.photos` is `undefined` (the `findUnique` call doesn't `include: { photos: true }` yet)

- [ ] **Step 3: Wire the cleanup into `update`**

In `packages/api/src/routers/listings.ts`, add the import:

```ts
import { photoPathBelongsToUser } from '@garage-sale/core';
```

(add `photoPathBelongsToUser` to the existing `import { findProhibitedKeyword, MAX_LISTING_PHOTOS } from '@garage-sale/core';` line instead of a new line)

Add a second import line:

```ts
import { deleteBlobFiles } from '../upload.js';
```

Replace the `update` mutation (lines 104-124) with:

```ts
  /** Edit a DRAFT or ACTIVE listing (editing live is free). Replaces photos. */
  update: protectedProcedure
    .input(listingInput.extend({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      traderOnly(ctx.principal.role);
      const existing = await ctx.prisma.listing.findUnique({
        where: { id: input.id },
        include: { photos: true },
      });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });
      if (existing.ownerId !== ctx.principal.userId) throw new TRPCError({ code: 'FORBIDDEN' });
      if (existing.status !== ListingStatus.DRAFT && existing.status !== ListingStatus.ACTIVE) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This listing cannot be edited' });
      }
      await screenCategory(ctx.prisma, input.categoryId, `${input.title} ${input.description}`);
      const { id, photos, ...data } = input;
      const removedBlobUrls = existing.photos
        .map((p) => p.url)
        .filter((url) => !photos.includes(url))
        .filter((url) =>
          photoPathBelongsToUser(new URL(url).pathname.replace(/^\//, ''), ctx.principal.userId),
        );
      // Replace photos wholesale to keep ordering simple.
      await ctx.prisma.listingPhoto.deleteMany({ where: { listingId: id } });
      const updated = await ctx.prisma.listing.update({
        where: { id },
        data: { ...data, photos: { create: photos.map((url, i) => ({ url, sortOrder: i })) } },
        include: listingInclude,
      });
      await deleteBlobFiles(removedBlobUrls);
      return updated;
    }),
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @garage-sale/api test`
Expected: PASS, no regressions elsewhere

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @garage-sale/api typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/routers/listings.ts packages/api/src/routers/listings.test.ts
git commit -m "feat(api): best-effort delete removed photos from Blob on listings.update"
```

---

### Task 6: Env var + full backend gate check

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Document the new env var**

In `.env.example`, add a new section (place it after the "Cron" section, before "App URLs"):

```
# ─── File storage (photo uploads) ───────────────────────────
# Vercel Blob read/write token. Server-only — never exposed to the client;
# per-upload client tokens are minted from this and are short-lived/scoped.
BLOB_READ_WRITE_TOKEN=""
```

- [ ] **Step 2: Run the full pre-commit gate**

Run: `pnpm -r typecheck && pnpm -r lint && pnpm -r test && pnpm format:check`
Expected: all green. If prettier complains, run `pnpm format` first, then re-run `pnpm format:check`.

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "docs: document BLOB_READ_WRITE_TOKEN for photo uploads"
```

---

### Task 7: Web — PhotoUploader component

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/src/app/(user)/app/listings/PhotoUploader.tsx`
- Modify: `apps/web/src/app/(user)/app/listings/ListingForm.tsx`

- [ ] **Step 1: Add the dependency**

Run: `pnpm add --filter @garage-sale/web @vercel/blob`
Expected: `@vercel/blob` appears under `dependencies` in `apps/web/package.json`

- [ ] **Step 2: Write the component**

Create `apps/web/src/app/(user)/app/listings/PhotoUploader.tsx`:

```tsx
'use client';

// Photo picker + uploader for the listing form. Compresses client-side, mints
// a short-lived Blob upload token via tRPC, then uploads directly to Vercel
// Blob — the server never sees the file bytes. Replaces the old raw-URL text
// inputs; the resulting URLs feed into the same `photos: string[]` form state.

import { useRef, useState } from 'react';
import { upload } from '@vercel/blob/client';
import { MAX_LISTING_PHOTOS } from '@garage-sale/core';
import { trpc } from '../../../../lib/trpc';

const ACCEPT = 'image/jpeg,image/png,image/webp';
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;

/** Resize to at most MAX_DIMENSION on the longest side and JPEG-compress. */
async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not compress image'))),
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
}

export function PhotoUploader({
  photos,
  onChange,
}: {
  photos: string[];
  onChange(photos: string[]): void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    let current = photos;
    try {
      for (const file of Array.from(files)) {
        if (current.length >= MAX_LISTING_PHOTOS) break;
        const compressed = await compressImage(file);
        const { token, pathname } = await trpc.uploads.createUploadToken.mutate({
          contentType: 'image/jpeg',
        });
        const blob = await upload(pathname, compressed, { access: 'public', token });
        current = [...current, blob.url];
        onChange(current);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function removePhoto(url: string) {
    onChange(photos.filter((p) => p !== url));
    trpc.uploads.deleteFile.mutate({ url }).catch(() => {
      // Best-effort cleanup; the photo is already gone from the form either way.
    });
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-gray-700">
        Photos (max {MAX_LISTING_PHOTOS})
      </legend>
      <div className="flex flex-wrap gap-3">
        {photos.map((url) => (
          <div key={url} className="relative h-24 w-24">
            <img
              src={url}
              alt=""
              className="h-24 w-24 rounded border border-gray-300 object-cover"
            />
            <button
              type="button"
              aria-label="Remove photo"
              onClick={() => removePhoto(url)}
              className="absolute -right-2 -top-2 rounded-full border border-gray-300 bg-white px-2 text-gray-500"
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>
        ))}
      </div>
      {photos.length < MAX_LISTING_PHOTOS && (
        <label className="inline-block text-sm text-gray-600 hover:underline">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple
            disabled={uploading}
            onChange={(e) => void handleFiles(e.target.files)}
            className="hidden"
          />
          <span className="cursor-pointer rounded border border-gray-300 px-3 py-2">
            {uploading ? 'Uploading…' : '+ Add photo'}
          </span>
        </label>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </fieldset>
  );
}
```

- [ ] **Step 3: Typecheck against the installed SDK types**

Run: `pnpm --filter @garage-sale/web typecheck`
Expected: PASS. If `upload()`'s option names differ (e.g. `token` vs. something else), check `node_modules/@vercel/blob/dist/client.d.mts` and adjust.

- [ ] **Step 4: Wire it into `ListingForm.tsx`**

In `apps/web/src/app/(user)/app/listings/ListingForm.tsx`:

Add the import (after the existing `Field, FormMessage, SubmitButton` import):

```tsx
import { PhotoUploader } from './PhotoUploader';
```

Remove the now-unused `setPhoto` function (lines 58-60):

```tsx
  function setPhoto(i: number, url: string) {
    setValues((v) => ({ ...v, photos: v.photos.map((p, idx) => (idx === i ? url : p)) }));
  }
```

Replace the `<fieldset>` block (lines 182-216) with:

```tsx
      <PhotoUploader photos={values.photos} onChange={(photos) => set('photos', photos)} />
```

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm --filter @garage-sale/web typecheck && pnpm --filter @garage-sale/web lint`
Expected: PASS

- [ ] **Step 6: Manual browser verification**

Start the dev server and exercise the golden path + edge cases:

Run: `pnpm --filter @garage-sale/web dev`

In the browser, log in as a trader, go to My Listings → create a listing:
- Add 2-3 photos via the file picker — confirm thumbnails render and the network tab shows a direct `PUT` to a `vercel-storage.com`/Blob host, not to `/api/trpc`.
- Remove one photo — confirm the thumbnail disappears and a `uploads.deleteFile` call fires.
- Add photos up to `MAX_LISTING_PHOTOS` (10) — confirm the "+ Add photo" control disappears at the limit.
- Save the listing, then edit it — confirm previously uploaded photos still load from their Blob URLs.
- Try a non-image file — confirm a clear error message, not a silent failure.

Note: this requires `BLOB_READ_WRITE_TOKEN` to be set in the local `.env` — if it's blank, `createUploadToken` will throw `Error: BLOB_READ_WRITE_TOKEN is not set` — wait, actually `@vercel/blob` reads its own env var directly without our own guard; if you see that error, get a token from the Vercel dashboard for a dev Blob store and set it locally to complete this manual check.

- [ ] **Step 7: Commit**

```bash
git add apps/web/package.json apps/web/src/app/\(user\)/app/listings/PhotoUploader.tsx apps/web/src/app/\(user\)/app/listings/ListingForm.tsx
git commit -m "feat(web): replace listing photo URL inputs with direct-to-Blob upload widget"
```

---

### Task 8: Mobile — dependencies + permissions

**Files:**
- Modify: `apps/mobile/package.json`
- Modify: `apps/mobile/app.json`

- [ ] **Step 1: Install Expo-managed dependencies at the correct SDK-52 versions**

Run: `cd apps/mobile && npx expo install expo-image-picker expo-image-manipulator`

Expected: `expo-image-picker` and `expo-image-manipulator` added to `apps/mobile/package.json` at versions compatible with Expo SDK 52 (expo-install resolves this automatically — don't hand-pick versions).

- [ ] **Step 2: Install the Blob client**

Run: `pnpm add --filter @garage-sale/mobile @vercel/blob`
Expected: `@vercel/blob` appears under `dependencies` in `apps/mobile/package.json`

- [ ] **Step 3: Add the `expo-image-picker` config plugin**

In `apps/mobile/app.json`, add an entry to the `plugins` array (alongside the existing `@stripe/stripe-react-native` and `expo-notifications` entries):

```json
      [
        "expo-image-picker",
        {
          "photosPermission": "Garage Sale needs access to your photos so you can add pictures to your listings.",
          "cameraPermission": "Garage Sale needs access to your camera so you can take photos for your listings."
        }
      ]
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @garage-sale/mobile typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/package.json apps/mobile/app.json
git commit -m "chore(mobile): add expo-image-picker/expo-image-manipulator/@vercel/blob + permissions"
```

---

### Task 9: Mobile — usePhotoUpload hook

**Files:**
- Create: `apps/mobile/src/photos/usePhotoUpload.ts`

- [ ] **Step 1: Write the hook**

Create `apps/mobile/src/photos/usePhotoUpload.ts`:

```ts
// Photo picker + uploader for the listing form (native mirror of the web
// PhotoUploader). Compresses via expo-image-manipulator, mints a short-lived
// Blob upload token via tRPC, then uploads directly to Vercel Blob using the
// same @vercel/blob/client helper as web — the local file is read into a Blob
// via fetch() first, which RN's fetch/Blob implementation supports directly.

import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { upload } from '@vercel/blob/client';
import { trpc } from '../api/client';

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;

export type PhotoUploadResult = { ok: true; url: string } | { ok: false; error: string };

async function pick(source: 'camera' | 'library'): Promise<ImagePicker.ImagePickerResult> {
  const perm =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Permission denied');
  const options: ImagePicker.ImagePickerOptions = { quality: 1 };
  return source === 'camera'
    ? ImagePicker.launchCameraAsync(options)
    : ImagePicker.launchImageLibraryAsync(options);
}

/** Resize so the longest side is at most MAX_DIMENSION, then JPEG-compress. */
async function compress(uri: string, width: number, height: number): Promise<string> {
  const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
  const actions = scale < 1 ? [{ resize: { width: Math.round(width * scale) } }] : [];
  const result = await ImageManipulator.manipulateAsync(uri, actions, {
    compress: JPEG_QUALITY,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return result.uri;
}

export function usePhotoUpload() {
  return async function pickAndUpload(source: 'camera' | 'library'): Promise<PhotoUploadResult> {
    try {
      const picked = await pick(source);
      if (picked.canceled || picked.assets.length === 0) return { ok: false, error: 'cancelled' };
      const asset = picked.assets[0];
      const uri = await compress(asset.uri, asset.width, asset.height);
      const fileBlob = await (await fetch(uri)).blob();
      const { token, pathname } = await trpc.uploads.createUploadToken.mutate({
        contentType: 'image/jpeg',
      });
      const blob = await upload(pathname, fileBlob, { access: 'public', token });
      return { ok: true, url: blob.url };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Upload failed' };
    }
  };
}
```

- [ ] **Step 2: Typecheck against the installed SDK types**

Run: `pnpm --filter @garage-sale/mobile typecheck`
Expected: PASS. Two known risk spots to check against the installed type defs if this fails:
- `ImagePicker.ImagePickerOptions` may require an explicit `mediaTypes` field in the installed version — if so, check `node_modules/expo-image-picker/build/ImagePicker.types.d.ts` for the current accepted value (older API: `MediaTypeOptions.Images`; newer API: `['images']`) and set it explicitly.
- `@vercel/blob/client`'s `upload()` option names — same check as the web task, `node_modules/@vercel/blob/dist/client.d.mts`.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/photos/usePhotoUpload.ts
git commit -m "feat(mobile): add usePhotoUpload hook (pick, compress, direct-to-Blob upload)"
```

---

### Task 10: Mobile — wire into ListingFormScreen

**Files:**
- Modify: `apps/mobile/src/screens/ListingFormScreen.tsx`

- [ ] **Step 1: Update imports**

Replace the react-native import line:

```tsx
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
```

with:

```tsx
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
```

(`TextInput` is no longer used directly in this file once the raw URL inputs are gone — the shared `Field` component still uses its own internally.)

Add a new import after the `trpc` import:

```tsx
import { usePhotoUpload } from '../photos/usePhotoUpload';
```

- [ ] **Step 2: Update the file's top comment**

Replace line 3:

```tsx
// Photos are URLs for now; camera/library upload lands in a later P12 stage.
```

with:

```tsx
// Photos are uploaded via the device camera/library (usePhotoUpload), not typed URLs.
```

- [ ] **Step 3: Add upload state + handlers**

Inside `ListingFormScreen`, right after `const { pop } = useNav();`, add:

```tsx
  const pickAndUpload = usePhotoUpload();
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
```

Right after the `set` function, add:

```tsx
  async function addPhoto(source: 'camera' | 'library') {
    setPhotoPickerOpen(false);
    setPhotoUploading(true);
    setError(null);
    const result = await pickAndUpload(source);
    setPhotoUploading(false);
    if (!result.ok) {
      if (result.error !== 'cancelled') setError(result.error);
      return;
    }
    set('photos', [...values.photos, result.url]);
  }

  function removePhoto(url: string) {
    set(
      'photos',
      values.photos.filter((p) => p !== url),
    );
    trpc.uploads.deleteFile.mutate({ url }).catch(() => {
      // Best-effort cleanup; the photo is already gone from the form either way.
    });
  }
```

- [ ] **Step 4: Replace the photo UI block**

Replace the `<View style={styles.photos}>...</View>` block (lines 164-203 in the original file) with:

```tsx
      <View style={styles.photos}>
        <Text style={styles.photosLabel}>Photos (max 10)</Text>
        <View style={styles.photoGrid}>
          {values.photos.map((url) => (
            <View key={url} style={styles.thumbWrap}>
              <Image source={{ uri: url }} style={styles.thumb} />
              <Pressable
                accessibilityLabel="Remove photo"
                onPress={() => removePhoto(url)}
                style={styles.thumbRemove}
              >
                <Text aria-hidden style={styles.photoRemoveText}>
                  ✕
                </Text>
              </Pressable>
            </View>
          ))}
        </View>
        {values.photos.length < 10 &&
          (photoPickerOpen ? (
            <View style={styles.photoPickerRow}>
              <SecondaryButton title="Take Photo" onPress={() => void addPhoto('camera')} />
              <SecondaryButton
                title="Choose from Library"
                onPress={() => void addPhoto('library')}
              />
            </View>
          ) : (
            <SecondaryButton
              title={photoUploading ? 'Uploading…' : '+ Add photo'}
              disabled={photoUploading}
              onPress={() => setPhotoPickerOpen(true)}
            />
          ))}
      </View>
```

- [ ] **Step 5: Update styles**

In the `StyleSheet.create({...})` block, replace the old `photoRow`, `photoInput`, `photoRemove` entries with:

```ts
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumbWrap: { width: 72, height: 72 },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumbRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPickerRow: { flexDirection: 'row', gap: 8 },
```

(keep `photos`, `photosLabel`, and `photoRemoveText` as they are — they're still used.)

- [ ] **Step 6: Typecheck + lint**

Run: `pnpm --filter @garage-sale/mobile typecheck && pnpm --filter @garage-sale/mobile lint`
Expected: PASS

- [ ] **Step 7: Manual verification**

This app has `newArchEnabled: true` and now adds two more native modules (`expo-image-picker`, `expo-image-manipulator`), on top of the existing Stripe + notifications modules — per this project's established pattern, that means **Expo Go cannot run it**; verification requires an EAS build.

Run: `cd apps/mobile && eas build -p android --profile development` (or `preview`), install the resulting build on a device/emulator, then:
- Open the listing create form → tap "+ Add photo" → confirm "Take Photo" / "Choose from Library" both appear.
- Take/choose a photo — confirm it compresses+uploads and a thumbnail appears.
- Remove a photo — confirm it disappears from the grid.
- Add photos up to 10 — confirm the add control disappears at the limit.

If a physical EAS build isn't available in this environment, note that this step is deferred to the next scheduled EAS build and do not mark it complete without it — this mirrors the existing "cloud build is ops" caveat already documented for this app.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/screens/ListingFormScreen.tsx
git commit -m "feat(mobile): replace listing photo URL inputs with camera/library upload"
```

---

### Task 11: Docs + final gate

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the "Photo upload" deferred-item bullet**

In `CLAUDE.md`, under "Known deferred items / open loose ends", replace the bullet:

```
- **Photo upload:** listings take photo **URLs** only on **both web and mobile** — there is no blob storage or upload endpoint, so **camera/library upload (the one P12 scope item not built) is backend-blocked**, not a mobile gap. Add a blob-storage upload procedure (and an upload widget on web + `expo-image-picker` on mobile) as its own follow-up before camera upload.
```

with:

```
- **Photo upload** ✅ done: Vercel Blob, direct client-to-blob upload via short-lived scoped tokens (`packages/api/src/upload.ts` + `uploads` router: `createUploadToken`/`deleteFile`, rate-limited per user). `ListingPhoto.url` is unchanged — `listings.create`/`update` still take plain URL strings; only how those URLs get produced changed. Web: `PhotoUploader.tsx` (canvas resize/compress + `@vercel/blob/client`). Mobile: `usePhotoUpload.ts` (`expo-image-picker` camera/library + `expo-image-manipulator` compress), needs the `expo-image-picker` EAS rebuild like the other native modules. Removed photos are best-effort deleted from Blob on `listings.update`; `listings.remove` is a soft delete (status flag) so it does **not** touch Blob. Needs `BLOB_READ_WRITE_TOKEN` set at deploy.
```

- [ ] **Step 2: Update the P12 mobile bullet's camera-upload mention**

In the same file, in the "Mobile User Portal (P12)" bullet, remove the clause `Location-radius browse filter omitted (needs device geolocation).` — no change needed there — instead find and remove any stray reference implying camera upload is still pending in that bullet (if present) so it doesn't contradict the updated "Photo upload" bullet above. (If no such reference exists in that specific bullet, skip this step — the P12 bullet doesn't mention photo upload directly per the current text.)

- [ ] **Step 3: Run the full pre-commit gate**

Run: `pnpm -r typecheck && pnpm -r lint && pnpm -r test && pnpm format:check`
Expected: all green

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: mark camera/library photo upload done, resolve the deferred backlog item"
```
