import Link from 'next/link';

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
          <Link href="/app/trades">Trades</Link>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl w-full flex-1 p-4">{children}</main>
    </div>
  );
}
