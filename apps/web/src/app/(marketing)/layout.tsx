import Link from 'next/link';
import { serverApi } from '../../lib/server';

// Public marketing shell. SEO, CMS-driven content, and the single login entry
// that routes staff → Admin Portal, traders → User Portal (P2/P10). The footer
// lists published CMS pages (legal/marketing) pulled from the content router.
export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const api = await serverApi();
  const pages = await api.content.published();

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
      <footer className="border-t p-4 text-sm text-gray-500">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 sm:flex-row sm:justify-between">
          <span>© {new Date().getFullYear()} Garage Sale</span>
          {pages.length > 0 && (
            <nav className="flex flex-wrap justify-center gap-4">
              {pages.map((p) => (
                <Link key={p.slug} href={`/${p.slug}`} className="hover:underline">
                  {p.title}
                </Link>
              ))}
            </nav>
          )}
        </div>
      </footer>
    </div>
  );
}
