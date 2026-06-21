'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { trpc } from '../../../lib/trpc';

// Consumes the verification token from the email link on mount, then guides the
// trader to log in.
export function VerifyEmail({ token }: { token: string | null }) {
  const [state, setState] = useState<'pending' | 'ok' | 'error'>('pending');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // guard React 18 StrictMode double-invoke
    ran.current = true;
    if (!token) {
      setState('error');
      return;
    }
    trpc.auth.verifyEmail
      .mutate({ token })
      .then(() => setState('ok'))
      .catch(() => setState('error'));
  }, [token]);

  if (state === 'pending') return <p className="text-sm text-gray-500">Verifying your email…</p>;
  if (state === 'ok') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-green-700">Email verified. You can now log in.</p>
        <Link href="/login" className="inline-block text-sm font-medium hover:underline">
          Go to log in →
        </Link>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-red-600">This verification link is invalid or has expired.</p>
      <Link href="/login" className="inline-block text-sm font-medium hover:underline">
        Back to log in
      </Link>
    </div>
  );
}
