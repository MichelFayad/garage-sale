import Link from 'next/link';
import { LogoutButton } from '../../components/LogoutButton';

// Staff portal shell — guarded (admin roles SUPER/OPERATIONS/SUPPORT) by
// middleware.ts. Admin staff authenticate with email/password only.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-slate-900 text-white">
        <nav className="mx-auto max-w-6xl flex items-center gap-6 p-4 text-sm">
          <Link href="/admin" className="font-semibold">
            Garage Sale · Admin
          </Link>
          <Link href="/admin/users">Users</Link>
          <Link href="/admin/listings">Listings</Link>
          <Link href="/admin/fee">Fee</Link>
          <Link href="/admin/reports">Reports</Link>
          <LogoutButton className="ml-auto text-slate-300 hover:underline" />
        </nav>
      </header>
      <main className="mx-auto max-w-6xl w-full flex-1 p-4">{children}</main>
    </div>
  );
}
