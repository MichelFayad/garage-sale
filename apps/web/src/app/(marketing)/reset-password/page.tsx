import type { Metadata } from 'next';
import { ResetPasswordForm } from './ResetPasswordForm';

export const metadata: Metadata = { title: 'Reset password' };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <section className="mx-auto max-w-sm py-16">
      <h1 className="text-2xl font-semibold">Choose a new password</h1>
      <div className="mt-6">
        <ResetPasswordForm token={token ?? null} />
      </div>
    </section>
  );
}
