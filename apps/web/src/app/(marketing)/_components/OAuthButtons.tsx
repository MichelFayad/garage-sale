// Provider sign-in buttons. Each starts the server-side OAuth redirect flow at
// /api/oauth/[provider]; the callback mints our session cookie. Apple appears on
// web for account-linking parity (App Store requires it on mobile).

import Link from 'next/link';

const PROVIDERS = [
  { id: 'google', label: 'Continue with Google' },
  { id: 'apple', label: 'Continue with Apple' },
  { id: 'facebook', label: 'Continue with Facebook' },
] as const;

export function OAuthButtons() {
  return (
    <div className="space-y-2">
      {PROVIDERS.map((p) => (
        <Link
          key={p.id}
          href={`/api/oauth/${p.id}`}
          className="block rounded border border-gray-300 px-3 py-2 text-center text-sm font-medium hover:bg-gray-50"
        >
          {p.label}
        </Link>
      ))}
    </div>
  );
}
