import Link from 'next/link';
import { LogoutButton } from '../../components/LogoutButton';

// Trader portal shell — guarded (role=TRADER, account ACTIVE) by middleware.ts.
export default function UserLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-gray-50">
        <nav className="mx-auto max-w-5xl flex items-center gap-6 p-4 text-sm">
          <Link href="/app" className="font-semibold">
            Garage Sale
          </Link>
          <Link href="/app/listings">My listings</Link>
          <Link href="/app/browse">Browse</Link>
          <Link href="/app/watchlist">Watchlist</Link>
          <Link href="/app/trades">Trades</Link>
          <Link href="/app/billing">Payment</Link>
          <LogoutButton className="ml-auto text-gray-500 hover:underline" />
        </nav>
      </header>
      <main className="mx-auto max-w-5xl w-full flex-1 p-4">{children}</main>
    </div>
  );
}
