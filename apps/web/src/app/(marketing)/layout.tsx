import Link from 'next/link';

// Public marketing shell. SEO, CMS-driven content, and the single login entry
// that routes staff → Admin Portal, traders → User Portal (P2/P10).
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <nav className="mx-auto max-w-5xl flex items-center justify-between p-4">
          <Link href="/" className="font-semibold">
            Garage Sale
          </Link>
          <div className="flex gap-4 text-sm">
            <Link href="/how-it-works">How it works</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/login">Log in</Link>
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl w-full flex-1 p-4">{children}</main>
      <footer className="border-t p-4 text-center text-sm text-gray-500">
        © {new Date().getFullYear()} Garage Sale
      </footer>
    </div>
  );
}
