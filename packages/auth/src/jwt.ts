// JWT bearer auth for the mobile app + shared API. Web uses Auth.js cookie
// sessions (wired in apps/web at P2); both resolve to the same principal.

import { jwtVerify, SignJWT } from 'jose';
import type { Role } from './roles.js';

export interface TokenClaims {
  sub: string; // userId
  role: Role;
}

export type TokenKind = 'access' | 'refresh';

function secretFor(kind: TokenKind): Uint8Array {
  const raw = kind === 'access' ? process.env.JWT_ACCESS_SECRET : process.env.JWT_REFRESH_SECRET;
  if (!raw) throw new Error(`Missing ${kind} JWT secret`);
  return new TextEncoder().encode(raw);
}

function ttlFor(kind: TokenKind): number {
  const fallback = kind === 'access' ? 900 : 2_592_000;
  const raw = kind === 'access' ? process.env.JWT_ACCESS_TTL : process.env.JWT_REFRESH_TTL;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function signToken(claims: TokenClaims, kind: TokenKind): Promise<string> {
  return new SignJWT({ role: claims.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlFor(kind))
    .sign(secretFor(kind));
}

export async function verifyToken(token: string, kind: TokenKind): Promise<TokenClaims> {
  const { payload } = await jwtVerify(token, secretFor(kind));
  if (typeof payload.sub !== 'string' || typeof payload.role !== 'string') {
    throw new Error('Malformed token claims');
  }
  return { sub: payload.sub, role: payload.role as Role };
}
