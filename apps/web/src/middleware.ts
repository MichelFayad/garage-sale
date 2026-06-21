import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Role routing + auth guards. P0 ships the matcher + structure; session
// decoding, role redirects, and suspended/banned blocking are wired in P2.
export function middleware(_req: NextRequest) {
  // TODO(P2): read session (cookie) / bearer, redirect by role, block
  // SUSPENDED/BANNED, send unauthenticated users on guarded routes to /login.
  return NextResponse.next();
}

export const config = {
  matcher: ['/app/:path*', '/admin/:path*'],
};
