import type { Metadata } from 'next';
import Link from 'next/link';
import { ForgotPasswordForm } from './ForgotPasswordForm';

export const metadata: Metadata = { title: 'Forgot password' };

export default function ForgotPasswordPage() {
  return (
    <section className="mx-auto max-w-sm py-16">
      <h1 className="text-2xl font-semibold">Reset your password</h1>
      <p className="mt-1 text-sm text-gray-500">We&apos;ll email you a link to set a new one.</p>
      <div className="mt-6">
        <ForgotPasswordForm />
      </div>
      <Link href="/login" className="mt-3 inline-block text-sm text-gray-600 hover:underline">
        Back to log in
      </Link>
    </section>
  );
}
