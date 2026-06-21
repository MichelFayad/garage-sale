import type { Metadata } from 'next';
import { VerifyEmail } from './VerifyEmail';

export const metadata: Metadata = { title: 'Verify email' };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <section className="mx-auto max-w-sm py-16">
      <h1 className="text-2xl font-semibold">Verify your email</h1>
      <div className="mt-6">
        <VerifyEmail token={token ?? null} />
      </div>
    </section>
  );
}
