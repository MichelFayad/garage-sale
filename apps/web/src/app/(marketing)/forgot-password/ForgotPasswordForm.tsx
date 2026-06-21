'use client';

import { useState } from 'react';
import { trpc } from '../../../lib/trpc';
import { Field, FormMessage, SubmitButton } from '../_components/fields';

// Starts a password reset. The API is enumeration-safe (silent on unknown email),
// so we always show the same confirmation regardless of whether the email exists.
export function ForgotPasswordForm() {
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const data = new FormData(e.currentTarget);
    try {
      await trpc.auth.requestPasswordReset.mutate({ email: String(data.get('email')) });
    } finally {
      setDone(true);
    }
  }

  if (done) {
    return (
      <FormMessage tone="success">
        If that email has an account, a password reset link is on its way.
      </FormMessage>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Email" name="email" type="email" autoComplete="email" required />
      <SubmitButton disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</SubmitButton>
    </form>
  );
}
