const SECTIONS = [
  { href: '/admin/users', label: 'Users', desc: 'Search, suspend/ban, trust' },
  { href: '/admin/listings', label: 'Listings', desc: 'Moderate & remove' },
  { href: '/admin/trades', label: 'Trades', desc: 'Oversight & threads' },
  { href: '/admin/reports', label: 'Reports', desc: 'Moderation queue' },
  { href: '/admin/flags', label: 'Flags', desc: 'Untrusted review' },
  { href: '/admin/categories', label: 'Categories', desc: 'Catalogue & keywords' },
  { href: '/admin/fee', label: 'Fee', desc: 'Per-post fee config' },
  { href: '/admin/settings', label: 'Settings', desc: 'Platform settings' },
  { href: '/admin/staff', label: 'Staff', desc: 'Admin accounts (SUPER)' },
  { href: '/admin/audit', label: 'Audit', desc: 'Action log' },
];

const EXPORTS = ['users', 'listings', 'trades', 'audit'] as const;

export default function AdminDashboard() {
  return (
    <section className="py-8">
      <h1 className="text-2xl font-semibold">Admin dashboard</h1>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {SECTIONS.map((s) => (
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
        {EXPORTS.map((e) => (
          <a
            key={e}
            href={`/api/admin/export?entity=${e}`}
            className="rounded bg-gray-100 px-3 py-2 hover:bg-gray-200"
          >
            {e}.csv
          </a>
        ))}
      </div>
    </section>
  );
}
