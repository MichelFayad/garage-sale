// Admin CSV export (P9). Staff-only download of users / listings / trades /
// audit log as CSV. Auth is the same session principal the API uses; we resolve
// it from the request headers and reject non-admins. Runs on Node (streams text).

import { NextResponse, type NextRequest } from 'next/server';
import { createContext } from '@garage-sale/api';

export const runtime = 'nodejs';

type Entity = 'users' | 'listings' | 'trades' | 'audit';
const ENTITIES: readonly Entity[] = ['users', 'listings', 'trades', 'audit'];

/** RFC-4180 cell: quote when the value contains a comma, quote, or newline. */
function cell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\n');
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = await createContext({ headers: req.headers });
  if (!ctx.principal || ctx.principal.accountStatus !== 'ACTIVE') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (ctx.principal.role === 'TRADER') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const entity = req.nextUrl.searchParams.get('entity') as Entity | null;
  if (!entity || !ENTITIES.includes(entity)) {
    return NextResponse.json(
      { error: `entity must be one of ${ENTITIES.join(', ')}` },
      { status: 400 },
    );
  }

  let csv: string;
  if (entity === 'users') {
    const users = await ctx.prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
    csv = toCsv(
      [
        'id',
        'email',
        'displayName',
        'accountStatus',
        'trustStatus',
        'ratingAvg',
        'ratingCount',
        'createdAt',
      ],
      users.map((u) => [
        u.id,
        u.email,
        u.displayName,
        u.accountStatus,
        u.trustStatus,
        u.ratingAvg.toString(),
        u.ratingCount,
        u.createdAt.toISOString(),
      ]),
    );
  } else if (entity === 'listings') {
    const listings = await ctx.prisma.listing.findMany({
      orderBy: { createdAt: 'desc' },
      include: { owner: { select: { email: true } }, category: { select: { name: true } } },
    });
    csv = toCsv(
      ['id', 'title', 'type', 'status', 'category', 'ownerEmail', 'publishedAt', 'createdAt'],
      listings.map((l) => [
        l.id,
        l.title,
        l.type,
        l.status,
        l.category.name,
        l.owner.email,
        l.publishedAt?.toISOString() ?? '',
        l.createdAt.toISOString(),
      ]),
    );
  } else if (entity === 'trades') {
    const trades = await ctx.prisma.tradeProposal.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        listing: { select: { title: true } },
        proposer: { select: { email: true } },
        owner: { select: { email: true } },
      },
    });
    csv = toCsv(
      ['id', 'listing', 'status', 'proposerEmail', 'ownerEmail', 'completedAt', 'createdAt'],
      trades.map((t) => [
        t.id,
        t.listing.title,
        t.status,
        t.proposer.email,
        t.owner.email,
        t.completedAt?.toISOString() ?? '',
        t.createdAt.toISOString(),
      ]),
    );
  } else {
    // Audit log requires OPERATIONS+ (matches the router's audit.list tier).
    if (ctx.principal.role === 'SUPPORT') {
      return NextResponse.json({ error: 'Requires OPERATIONS role' }, { status: 403 });
    }
    const logs = await ctx.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      include: { admin: { select: { email: true, role: true } } },
    });
    csv = toCsv(
      ['id', 'admin', 'adminRole', 'entityType', 'entityId', 'action', 'reason', 'createdAt'],
      logs.map((a) => [
        a.id,
        a.admin.email,
        a.admin.role,
        a.entityType,
        a.entityId,
        a.action,
        a.reason ?? '',
        a.createdAt.toISOString(),
      ]),
    );
  }

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${entity}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
