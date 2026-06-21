'use client';

import { useState } from 'react';
import Link from 'next/link';
import { TRPCClientError } from '@trpc/client';
import { trpc } from '../../../lib/trpc';
import { Field, FormMessage, SubmitButton } from '../_components/fields';

// Consumes a reset token (from the email link) and sets a new password.
export function ResetPasswordForm({ token }: { token: string | null }) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!token) {
    return <FormMessage tone="error">This reset link is invalid or has expired.</FormMessage>;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const data = new FormData(e.currentTarget);
    const password = String(data.get('password'));
    if (password !== String(data.get('confirm'))) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    try {
      await trpc.auth.resetPassword.mutate({ token: token as string, password });
      setDone(true);
    } catch (err) {
      setError(err instanceof TRPCClientError ? err.message : 'Reset failed');
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-3">
        <FormMessage tone="success">Password updated. You can now log in.</FormMessage>
        <Link href="/login" className="inline-block text-sm font-medium hover:underline">
          Go to log in →
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
      />
      <Field
        label="Confirm password"
        name="confirm"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
      />
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <SubmitButton disabled={busy}>{busy ? 'Saving…' : 'Set new password'}</SubmitButton>
    </form>
  );
}
