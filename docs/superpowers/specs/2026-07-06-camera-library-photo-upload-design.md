# Camera/library photo upload — design

Closes the deferred backlog item: listings currently take photo **URLs only** (no blob storage, no upload endpoint), which is why mobile camera/library upload (a P12 scope item) was never built. This adds real upload on both web and mobile without changing the listing photo data model.

## Current state (as of this design)

- `packages/db/prisma/schema.prisma`: `Listing.photos: ListingPhoto[]`; `ListingPhoto` = `{ id, listingId, url: String, sortOrder: Int }`. No blob/file concept, just a URL string.
- `packages/api/src/routers/listings.ts`: `listingInput.photos = z.array(z.string().url()).max(MAX_LISTING_PHOTOS).default([])` (`MAX_LISTING_PHOTOS` = 10, from `@garage-sale/core`). `create` inserts `ListingPhoto` rows from the URL array; `update` deletes all old photo rows and recreates from the new URL array.
- `apps/web/src/app/(user)/app/listings/ListingForm.tsx`: manual URL text-inputs, add/remove buttons, max 10.
- `apps/mobile/src/screens/ListingFormScreen.tsx`: same manual URL text-inputs. Has a comment: "Photos are URLs for now; camera/library upload lands in a later P12 stage."
- No blob/S3/R2/Vercel Blob env vars anywhere. No `expo-image-picker`/`expo-image-manipulator` in `apps/mobile/package.json`. Web is deployed to Vercel (`vercel.json` present); mobile ships via EAS.

## Decisions

- **Storage provider: Vercel Blob.** Native to the existing Vercel deploy target, no new account/infra, simple SDK.
- **Upload path: direct client-to-blob.** Client gets a short-lived scoped token from our API, then uploads straight to Blob — avoids Vercel's ~4.5MB serverless request-body limit and avoids doubling server bandwidth. Standard for Vercel Blob.
- **URL text-inputs are fully replaced**, not kept as a fallback. Existing listings with URLs already in the DB keep rendering fine — the `ListingPhoto.url` field is unchanged, only how new URLs get produced changes.
- **Mobile picker: both camera and library**, user chooses via an inline action prompt.
- **Client-side compression**: resize to ~1600px longest side, JPEG quality ~0.8, before upload. Canvas resize on web, `expo-image-manipulator` on mobile.
- **Blob cleanup on removal**: when a photo is removed from a listing (edit) or a listing is removed entirely, best-effort-delete the corresponding Blob object(s). Failures are swallowed (matches the existing email/push "best effort" pattern in this codebase) — don't block the listing mutation on Blob API flakiness.

## Architecture

### New router: `packages/api/src/routers/uploads.ts`

Mounted as `appRouter.uploads`. All procedures are `protectedProcedure` (must be logged in) — prevents anonymous storage abuse.

- **`createUploadToken({ contentType })`**
  - Validates `contentType` ∈ `{image/jpeg, image/png, image/webp}`.
  - Mints a short-lived Vercel Blob client token via `generateClientTokenFromReadWriteToken` (`@vercel/blob/client`, imported server-side) scoped to path `listings/{callerUserId}/{uuid}.{ext}`.
  - Caps `maximumSizeInBytes` (~5MB — compression happens client-side first, so this is a safety ceiling, not the expected size).
  - No DB read/write — token minting is stateless given the JWT-authenticated caller.
  - Rate-limited via the existing `core/ratelimit.ts` fixed-window limiter (new preset, e.g. 30/hour per user) — reuses P11 infra, cheap insurance against storage-cost abuse.

- **`deleteFile({ url })`**
  - Parses the URL's pathname, asserts it's prefixed `listings/{callerUserId}/` (ownership check — no DB lookup needed since the caller's userId is embedded in the path itself).
  - Calls Blob `del()`. Errors are caught and swallowed (fire-and-forget cleanup, not a blocking guarantee).

### New env var

`BLOB_READ_WRITE_TOKEN` — server-only, added to `.env.example`. Never exposed to the client; per-request client tokens are minted server-side and are short-lived/scoped, unlike the master RW token.

### Upload flow (both platforms)

1. User picks/captures an image.
2. Client resizes/compresses it (canvas on web; `expo-image-manipulator` on mobile).
3. Client calls `uploads.createUploadToken({ contentType })`.
4. **Web**: uploads directly to Blob using `@vercel/blob/client`'s `upload()` helper with the returned token.
   **Mobile**: raw multipart `PUT`/upload via `fetch` straight to the Blob endpoint using the same token — the official web SDK's browser-specific internals aren't used in RN, to avoid an untested compatibility risk; the underlying protocol is the same, just platform-specific glue code.
5. The returned `url` is pushed into the form's existing `photos: string[]` state. **No change downstream** — `listings.create`/`update` keep accepting `photos: z.array(z.string().url()).max(10)` exactly as today.

### Form UX changes

- **`apps/web/.../ListingForm.tsx`**: replace the URL text-input array with an "Add Photo" file input/dropzone (accepts jpeg/png/webp) + a thumbnail preview grid. Each thumbnail has a remove button (`aria-label`, matching the existing icon-button a11y convention from the P11 sweep). Show a per-photo upload-in-progress state.
- **`apps/mobile/.../ListingFormScreen.tsx`**: replace the URL text-input array with an "Add Photo" button that offers Take Photo / Choose from Library, then runs the same compress → token → upload flow. Thumbnail grid + remove button, same as web.
  - New mobile deps: `expo-image-picker`, `expo-image-manipulator`.
  - New `expo-image-picker` config-plugin entry in `app.json` for camera/photo-library permission strings — same pattern used for the `expo-notifications` plugin in P13.
  - Requires an EAS rebuild (already true for this app — Stripe + notifications native modules already force EAS builds over Expo Go).

### Cleanup wiring

- `listings.update`: diff the old vs. new photo URL sets; after the DB write succeeds, best-effort `del()` the URLs that were removed.
- Wherever a listing (and its cascaded `ListingPhoto` rows) is fully removed: best-effort `del()` sweep over that listing's photo URLs alongside the DB delete. (Exact mutation name to be located during implementation — likely the existing "remove listing" mutation in `listings.ts`.)

### New dependencies

- `packages/api`: `@vercel/blob` (server: token mint + delete).
- `apps/web`: `@vercel/blob` client subpath (browser `upload()` helper).
- `apps/mobile`: `expo-image-picker`, `expo-image-manipulator`.

## Testing

- `packages/core`: pure function for the ownership-prefix check (`listings/{userId}/...` parsing), unit-tested like other pure functions in this package.
- `packages/api`: router tests mock `@vercel/blob`'s `put`/`del`/token-generation (same style as existing push/email mocks against a mocked Prisma client). Verifies: auth guard (must be logged in), rate-limit enforcement, ownership check on delete. No real Blob network calls in CI.

## Out of scope

- Video upload.
- HEIC transcoding beyond whatever `expo-image-manipulator` already outputs.
- An orphan-sweep cron for Blob objects that survive a crash mid-upload (rare, low-cost, not worth a scheduled job).
