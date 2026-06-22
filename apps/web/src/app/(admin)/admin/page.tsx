import { type AdminTier, meetsTier } from '@garage-sale/core';
import { getPrincipal } from '../../../lib/principal';

const SECTIONS: { href: string; label: string; desc: string; min?: AdminTier }[] = [
  { href: '/admin/users', label: 'Users', desc: 'Search, suspend/ban, trust' },
  { href: '/admin/listings', label: 'Listings', desc: 'Moderate & remove' },
  { href: '/admin/trades', label: 'Trades', desc: 'Oversight & threads' },
  { href: '/admin/reports', label: 'Reports', desc: 'Moderation queue' },
  { href: '/admin/flags', label: 'Flags', desc: 'Untrusted review' },
  { href: '/admin/categories', label: 'Categories', desc: 'Catalogue & keywords' },
  { href: '/admin/content', label: 'Content', desc: 'Marketing & legal pages' },
  { href: '/admin/fee', label: 'Fee', desc: 'Per-post fee config' },
  { href: '/admin/settings', label: 'Settings', desc: 'Platform settings' },
  { href: '/admin/staff', label: 'Staff', desc: 'Admin accounts (SUPER)', min: 'SUPER' },
  { href: '/admin/audit', label: 'Audit', desc: 'Action log', min: 'OPERATIONS' },
];

// CSV exports mirror the export route's tier checks (audit requires OPERATIONS+).
const EXPORTS: { entity: string; min?: AdminTier }[] = [
  { entity: 'users' },
  { entity: 'listings' },
  { entity: 'trades' },
  { entity: 'audit', min: 'OPERATIONS' },
];

export default async function AdminDashboard() {
  const principal = await getPrincipal();
  const role = principal?.role ?? '';
  const sections = SECTIONS.filter((s) => !s.min || meetsTier(role, s.min));
  const exports = EXPORTS.filter((e) => !e.min || meetsTier(role, e.min));

  return (
    <section className="py-8">
      <h1 className="text-2xl font-semibold">Admin dashboard</h1>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {sections.map((s) => (
          <a
            key={s.href}
            href={s.href}
            className="rounded border border-gray-200 p-4 hover:border-slate-400"
          >
            <div className="font-medium">{s.label}</div>
            <div className="text-sm text-gray-500">{s.desc}</div>
          </a>
        ))}
      </div>

      <h2 className="mt-8 font-medium">CSV exports</h2>
      <div className="mt-2 flex flex-wrap gap-3 text-sm">
        {exports.map((e) => (
          <a
            key={e.entity}
            href={`/api/admin/export?entity=${e.entity}`}
            className="rounded bg-gray-100 px-3 py-2 hover:bg-gray-200"
          >
            {e.entity}.csv
          </a>
        ))}
      </div>
    </section>
  );
}
