'use client';

import { useState } from 'react';
import { TRPCClientError } from '@trpc/client';
import { trpc } from '../../../lib/trpc';
import { Field, FormMessage, SubmitButton } from '../_components/fields';

// Trader sign-up. On success the API emails a verification link and issues no
// tokens — the trader must verify before they can log in.
export function RegisterForm() {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const data = new FormData(e.currentTarget);
    try {
      await trpc.auth.register.mutate({
        email: String(data.get('email')),
        password: String(data.get('password')),
        displayName: String(data.get('displayName')),
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof TRPCClientError ? err.message : 'Registration failed');
      setBusy(false);
    }
  }

  if (done) {
    return (
      <FormMessage tone="success">
        Check your email for a verification link to finish setting up your account.
      </FormMessage>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Display name" name="displayName" autoComplete="name" required />
      <Field label="Email" name="email" type="email" autoComplete="email" required />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
      />
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <SubmitButton disabled={busy}>{busy ? 'Creating…' : 'Create account'}</SubmitButton>
    </form>
  );
}
