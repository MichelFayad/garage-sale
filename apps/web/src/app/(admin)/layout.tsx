import Link from 'next/link';
import { type AdminTier, meetsTier } from '@garage-sale/core';
import { getPrincipal } from '../../lib/principal';
import { AdminRoleProvider } from '../../components/AdminRole';
import { LogoutButton } from '../../components/LogoutButton';

// Staff portal shell — guarded (admin roles SUPER/OPERATIONS/SUPPORT) by
// middleware.ts. Admin staff authenticate with email/password only. Nav links
// whose section can't even be viewed at the caller's tier are hidden (cosmetic;
// the API still enforces every tier server-side).
const NAV: { href: string; label: string; min?: AdminTier }[] = [
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/listings', label: 'Listings' },
  { href: '/admin/trades', label: 'Trades' },
  { href: '/admin/reports', label: 'Reports' },
  { href: '/admin/flags', label: 'Flags' },
  { href: '/admin/categories', label: 'Categories' },
  { href: '/admin/content', label: 'Content' },
  { href: '/admin/fee', label: 'Fee' },
  { href: '/admin/settings', label: 'Settings' },
  { href: '/admin/staff', label: 'Staff', min: 'SUPER' },
  { href: '/admin/audit', label: 'Audit', min: 'OPERATIONS' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const principal = await getPrincipal();
  const role = principal?.role ?? '';
  const links = NAV.filter((l) => !l.min || meetsTier(role, l.min));

  return (
    <AdminRoleProvider role={role}>
      <div className="min-h-screen flex flex-col">
        <header className="border-b bg-slate-900 text-white">
          <nav className="mx-auto max-w-6xl flex items-center gap-6 p-4 text-sm">
            <Link href="/admin" className="font-semibold">
              Garage Sale · Admin
            </Link>
            {links.map((l) => (
              <Link key={l.href} href={l.href}>
                {l.label}
              </Link>
            ))}
            <LogoutButton className="ml-auto text-slate-300 hover:underline" />
          </nav>
        </header>
        <main className="mx-auto max-w-6xl w-full flex-1 p-4">{children}</main>
      </div>
    </AdminRoleProvider>
  );
}
