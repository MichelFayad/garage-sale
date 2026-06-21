// Listing domain helpers: photo limits, prohibited-keyword screening, and the
// great-circle distance used by browse's location-radius filter. Pure functions
// reused by API (enforcement) and clients (pre-validation).

import { MAX_LISTING_PHOTOS } from './constants.js';

/** Whether a photo count is within the per-listing hard limit. */
export function photosWithinLimit(count: number): boolean {
  return Number.isInteger(count) && count >= 0 && count <= MAX_LISTING_PHOTOS;
}

/** First prohibited keyword found in the text (case-insensitive), else null. */
export function findProhibitedKeyword(text: string, keywords: string[]): string | null {
  const haystack = text.toLowerCase();
  for (const raw of keywords) {
    const kw = raw.trim().toLowerCase();
    if (kw && haystack.includes(kw)) return raw;
  }
  return null;
}

/** Great-circle distance between two lat/lng points, in kilometres. */
export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371; // Earth radius km
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
