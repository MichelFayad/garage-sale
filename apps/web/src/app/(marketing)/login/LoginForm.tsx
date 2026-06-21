'use client';

import { useState } from 'react';
import { Field, FormMessage, SubmitButton } from '../_components/fields';

// Credentials login. Posts to /api/auth/login (single entry: trader then admin),
// which sets the session cookie and returns the role's destination.
export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const data = new FormData(e.currentTarget);
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: data.get('email'), password: data.get('password') }),
    });
    const json = (await res.json()) as { redirect?: string; error?: string };
    if (res.ok && json.redirect) {
      window.location.assign(json.redirect);
      return;
    }
    setError(json.error ?? 'Login failed');
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Email" name="email" type="email" autoComplete="email" required />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <SubmitButton disabled={busy}>{busy ? 'Signing in…' : 'Log in'}</SubmitButton>
    </form>
  );
}
