import { describe, expect, it } from 'vitest';
import { findProhibitedKeyword, haversineKm, photosWithinLimit } from './listing.js';

describe('photosWithinLimit', () => {
  it('accepts 0..10', () => {
    expect(photosWithinLimit(0)).toBe(true);
    expect(photosWithinLimit(10)).toBe(true);
  });
  it('rejects >10 and non-integers', () => {
    expect(photosWithinLimit(11)).toBe(false);
    expect(photosWithinLimit(-1)).toBe(false);
    expect(photosWithinLimit(2.5)).toBe(false);
  });
});

describe('findProhibitedKeyword', () => {
  it('finds a keyword case-insensitively', () => {
    expect(findProhibitedKeyword('Selling a FIREARM today', ['firearm'])).toBe('firearm');
  });
  it('returns null when clean', () => {
    expect(findProhibitedKeyword('vintage lamp', ['firearm', 'drugs'])).toBeNull();
  });
  it('ignores blank keywords', () => {
    expect(findProhibitedKeyword('anything', ['', '  '])).toBeNull();
  });
});

describe('haversineKm', () => {
  it('is ~0 for the same point', () => {
    expect(haversineKm(40.7, -74, 40.7, -74)).toBeCloseTo(0, 5);
  });
  it('approximates a known distance (NYC↔LA ≈ 3935km)', () => {
    const d = haversineKm(40.7128, -74.006, 34.0522, -118.2437);
    expect(d).toBeGreaterThan(3900);
    expect(d).toBeLessThan(3980);
  });
});
