import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Log in' };

// Single auth entry. After login, role routing (middleware.ts) sends staff to
// /admin and traders to /app. Credentials + Google/Apple/Facebook wired in P2.
export default function LoginPage() {
  return (
    <section className="mx-auto max-w-sm py-16">
      <h1 className="text-2xl font-semibold">Log in</h1>
      <p className="mt-2 text-sm text-gray-500">Auth providers wired in P2.</p>
    </section>
  );
}
